//! The engine boundary.
//!
//! **This module is the stand-in for `xfingine`'s portfolio engine API**
//! (xfina-dev/xfingine#15, with the allocation, rebalancing and savings-rate
//! scenarios in #14). It is data-agnostic on purpose: everything below takes
//! already-sampled monthly price vectors and plain numbers, exactly as that API
//! will, and reads no files and no clock. When #15 publishes,
//! [`run`] keeps its signature and its body becomes a call into
//! `xfingine::portfolio`; `plan.rs`, `sim.rs` and `metrics.rs` are then deleted
//! from here, not rewritten. Nothing outside this module -- not `lib.rs`, not
//! the Vue app -- changes.
//!
//! The split is the same one the two libraries keep: `xfina` reads a
//! publisher's file, `xfingine` does arithmetic over parsed numbers, and Xfina
//! Labs composes the two.

pub mod metrics;
pub mod model;
pub mod plan;
pub mod sim;

use std::collections::BTreeMap;

use chrono::{Datelike, NaiveDate};

use crate::data::{self, Daily, InvestDay, Monthly};
use model::{AssetOut, RunRequest, RunResult, StrategyResult};
use plan::Plan;
use sim::SimInput;

/// Everything the run needs that the request only names: the files it refers
/// to, already parsed.
pub trait SeriesSource {
    fn get(&self, id: &str) -> Option<&xfina::models::PriceSeries>;
}

pub fn run(request: &RunRequest, source: &dyn SeriesSource) -> Result<RunResult, String> {
    if request.assets.is_empty() {
        return Err("No assets: pick a series for at least one asset.".into());
    }
    if request.strategies.is_empty() {
        return Err("No strategies: tick at least one in Choose Rebalancing.".into());
    }

    let run_from = parse_date(&request.period.from)?;
    let run_end = parse_date(&request.period.to)?;
    let (start_year, start_month) = parse_month(&request.plan.start_month)?;
    let (end_year, end_month) = parse_month(&request.plan.end_month)?;
    let months = data::months_between((start_year, start_month), (end_year, end_month));
    if months == 0 {
        return Err("The contribution period is empty.".into());
    }

    let fx = points(&request.fx)?;
    let cpi = points(&request.cpi)?;
    let day = InvestDay::parse(request.plan.invest_day.as_deref().unwrap_or("First working day"));

    // --- The data half ------------------------------------------------------
    let mut names = Vec::new();
    // What identifies each asset. The page sends one; a request without them
    // falls back to the name, which is what a run saved before ids existed has.
    let mut ids = Vec::new();
    let mut weights = Vec::new();
    let mut buy = Vec::new();
    let mut mark = Vec::new();
    let mut assets_out = Vec::new();
    for asset in &request.assets {
        let parts: Vec<&xfina::models::PriceSeries> = asset
            .files
            .iter()
            .map(|id| {
                source
                    .get(id)
                    .ok_or_else(|| format!("{}: its file is no longer loaded.", asset.name))
            })
            .collect::<Result<_, _>>()?;
        let mut daily = Daily::stitch(&parts);
        if daily.is_empty() {
            return Err(format!("{}: its files hold no values.", asset.name));
        }
        let currency = asset.currency.clone().unwrap_or_else(|| "INR".into());
        if currency != "INR" {
            if fx.is_empty() {
                return Err(format!(
                    "{} is quoted in {currency} and the run has no USD/INR series to convert it with.",
                    asset.name
                ));
            }
            daily = daily.times(&fx);
            if daily.is_empty() {
                return Err(format!(
                    "{}: the USD/INR series covers none of its dates.",
                    asset.name
                ));
            }
        }
        let first = daily.first().expect("non-empty");
        let last = daily.last().expect("non-empty");
        if first > run_from {
            return Err(format!(
                "{} starts {} , after the run's first day {}.",
                asset.name,
                data::iso(first),
                data::iso(run_from)
            ));
        }
        let sampled = Monthly::sample(&daily, (start_year, start_month), months, day, run_end)
            .ok_or_else(|| {
                format!(
                    "{}: no value in one of the run's months (it covers {} to {}).",
                    asset.name,
                    data::iso(first),
                    data::iso(last)
                )
            })?;
        let id = asset.id.clone().unwrap_or_else(|| asset.name.clone());
        assets_out.push(AssetOut {
            name: asset.name.clone(),
            id: Some(id.clone()),
            target: 0.0,
            weight: asset.weight,
            currency,
            rows: daily.0.len(),
            first: data::iso(first),
            last: data::iso(last),
        });
        names.push(asset.name.clone());
        ids.push(id);
        weights.push(asset.weight.max(0.0));
        buy.push(sampled.buy);
        mark.push(sampled.mark);
    }

    // Weights are normalised, so an allocation that totals 99% still runs; the
    // page's own warning is what tells the user it does not total 100.
    let sum: f64 = weights.iter().sum();
    if sum <= 0.0 {
        return Err("Every weight is zero: give at least one asset a weight.".into());
    }
    let targets: Vec<f64> = weights.iter().map(|w| w / sum).collect();
    for (out, t) in assets_out.iter_mut().zip(&targets) {
        out.target = *t;
    }

    // --- The money ----------------------------------------------------------
    let plan = Plan::build(&request.plan, months);
    let contribution: Vec<f64> = (0..months).map(|m| plan.contribution(m)).collect();
    let mut invested = Vec::with_capacity(months);
    {
        let mut running = 0.0;
        for c in &contribution {
            running += c;
            invested.push(running);
        }
    }

    // --- Inflation: from the CPI series where there is one -------------------
    let month_labels: Vec<String> = (0..months)
        .map(|m| data::month_label(start_year, start_month, m))
        .collect();
    let (to_today, inflation, inflation_from) =
        real_terms(&cpi, start_year, start_month, months, run_end, request.inflation);
    let mut invested_today = Vec::with_capacity(months);
    {
        let mut running = 0.0;
        for (m, c) in contribution.iter().enumerate() {
            running += c * to_today[m];
            invested_today.push(running);
        }
    }

    // --- The computation half ----------------------------------------------
    let input = SimInput {
        buy: &buy,
        mark: &mark,
        names: &names,
        ids: &ids,
        targets: &targets,
        contribution: &contribution,
        months,
        start_month_of_year: start_month,
        ltcg_rate: request.ltcg_rate,
        stcg_rate: request.stcg_rate,
    };

    let results: Vec<StrategyResult> = request
        .strategies
        .iter()
        .map(|strategy| {
            let out = sim::simulate(&input, strategy);
            metrics::describe(
                strategy,
                out,
                &metrics::Context {
                    contribution: &contribution,
                    invested: &invested,
                    invested_today: &invested_today,
                    to_today: &to_today,
                    months,
                    inflation,
                    risk_free: request.risk_free / 100.0,
                },
            )
        })
        .collect();

    Ok(RunResult {
        months,
        start_year,
        start_month,
        month_labels,
        start: data::iso(run_from),
        end: data::iso(run_end),
        contribution,
        invested,
        invested_today,
        to_today,
        inflation,
        inflation_from,
        risk_free: request.risk_free / 100.0,
        assets: assets_out,
        results,
    })
}

/// A rupee of each month in the run's last month's rupees, and the inflation
/// that implies.
///
/// With a CPI series the factor is the ratio of index levels, which is the
/// honest answer; without one it is the flat rate the request carries, and
/// `inflationFrom` says which it was so the page can label it.
fn real_terms(
    cpi: &Daily,
    start_year: i32,
    start_month: u32,
    months: usize,
    run_end: NaiveDate,
    flat: f64,
) -> (Vec<f64>, f64, String) {
    let level = |m: usize| -> Option<f64> {
        let (y, mo) = data::year_month(start_year, start_month, m);
        cpi.at(data::month_end(y, mo).min(run_end))
            .or_else(|| cpi.at(data::month_end(y, mo)))
    };
    let last = level(months - 1);
    let first = level(0);
    if let (Some(last), Some(first)) = (last, first) {
        if first > 0.0 && last > 0.0 && months > 1 {
            let to_today: Vec<f64> = (0..months)
                .map(|m| level(m).map(|l| last / l).unwrap_or(1.0))
                .collect();
            let years = (months - 1) as f64 / 12.0;
            let inflation = (last / first).powf(1.0 / years) - 1.0;
            return (to_today, inflation, "cpi".into());
        }
    }
    let rate = flat / 100.0;
    let to_today = (0..months)
        .map(|m| (1.0 + rate).powf((months - 1 - m) as f64 / 12.0))
        .collect();
    (to_today, rate, "assumed".into())
}

fn points(raw: &[(String, f64)]) -> Result<Daily, String> {
    let mut out: BTreeMap<NaiveDate, f64> = BTreeMap::new();
    for (date, value) in raw {
        if *value <= 0.0 {
            continue;
        }
        out.insert(parse_loose(date)?, *value);
    }
    Ok(Daily(out))
}

/// `YYYY-MM-DD`, or `YYYY-MM` for a monthly series, where the month stands for
/// its first day -- the convention Select Assets already states.
fn parse_loose(text: &str) -> Result<NaiveDate, String> {
    if text.len() == 7 {
        let (y, m) = parse_month(text)?;
        return NaiveDate::from_ymd_opt(y, m, 1).ok_or_else(|| format!("Not a month: {text}"));
    }
    parse_date(text)
}

fn parse_date(text: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(text, "%Y-%m-%d").map_err(|_| format!("Not a date: {text}"))
}

fn parse_month(text: &str) -> Result<(i32, u32), String> {
    let (y, m) = text
        .split_once('-')
        .ok_or_else(|| format!("Not a YYYY-MM month: {text}"))?;
    let year: i32 = y.parse().map_err(|_| format!("Not a year: {y}"))?;
    let month: u32 = m[..2.min(m.len())]
        .parse()
        .map_err(|_| format!("Not a month: {m}"))?;
    if !(1..=12).contains(&month) {
        return Err(format!("Not a month: {text}"));
    }
    Ok((year, month))
}

/// The month a date falls in, for callers that only have the date.
pub fn month_of(date: NaiveDate) -> (i32, u32) {
    (date.year(), date.month())
}
