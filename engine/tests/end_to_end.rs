//! The composition, end to end: bytes in a publisher's layout → `xfina` reads
//! them → the engine runs a backtest over them.
//!
//! The CSVs here are written in NSE Indices' own layout, with invented levels
//! that rise by a fixed amount each day, so the figures the engine returns can
//! be checked rather than eyeballed.

use std::collections::HashMap;

use chrono::Datelike;

use xfina::models::{ParseRequest, PriceSeries};
use xfina_labs_engine::portfolio::model::{
    AssetRequest, PlanRequest, Period, RunRequest, Strategy,
};
use xfina_labs_engine::portfolio::{self, SeriesSource};

struct Files(HashMap<String, PriceSeries>);

impl SeriesSource for Files {
    fn get(&self, id: &str) -> Option<&PriceSeries> {
        self.0.get(id)
    }
}

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// One year of an NSE total return index, as the site serves it: one file per
/// year, a row per weekday, growing by `daily` each day.
fn nse_year(index: &str, year: i32, start: f64, daily: f64) -> (String, String, f64) {
    let mut body = String::from("IndexName,Date,Total Returns Index\n");
    let mut level = start;
    let mut day = chrono::NaiveDate::from_ymd_opt(year, 1, 1).unwrap();
    let end = chrono::NaiveDate::from_ymd_opt(year, 12, 31).unwrap();
    let mut first = None;
    let mut last = day;
    while day <= end {
        if day.weekday().num_days_from_monday() < 5 {
            level *= 1.0 + daily;
            body.push_str(&format!(
                "{index},{:02} {} {},{:.4}\n",
                day.day(),
                MONTHS[day.month() as usize - 1],
                year,
                level
            ));
            first.get_or_insert(day);
            last = day;
        }
        day += chrono::Duration::days(1);
    }
    let name = format!(
        "{index}_Historical_TR_{}to{}.csv",
        first.unwrap().format("%d%m%Y"),
        last.format("%d%m%Y")
    );
    (name, body, level)
}

fn read(files: &mut Files, name: &str, body: &str) -> String {
    let statement = xfina::parse(
        ParseRequest::new(body.as_bytes()).with_filename(Some(name)),
    )
    .expect("xfina reads an NSE Indices CSV");
    let series = statement
        .data
        .series()
        .expect("a market data file parses to a price series")
        .clone();
    let id = format!("s{}", files.0.len() + 1);
    files.0.insert(id.clone(), series);
    id
}

fn plan(lumpsum: f64, monthly_salary_year: f64) -> PlanRequest {
    PlanRequest {
        lumpsum,
        salary_start: monthly_salary_year,
        salary_by: Some("Growth".into()),
        salary_growth: 0.0,
        salary_end: monthly_salary_year,
        salary_curve: Some("Compound".into()),
        tax_rate: 0.0,
        rate_start: 10.0,
        rate_end: 10.0,
        rate_curve: Some("Linear".into()),
        invest_day: Some("First working day".into()),
        start_month: "2020-01".into(),
        end_month: "2021-12".into(),
    }
}

#[test]
fn a_dataset_in_two_files_runs_end_to_end() {
    let mut files = Files(HashMap::new());
    // Two years of the same index, as two downloads: the engine has to stitch
    // them, because `xfina` reads one file and only that file.
    let (n1, b1, carried) = nse_year("NIFTY 50", 2020, 1000.0, 0.0005);
    let (n2, b2, _) = nse_year("NIFTY 50", 2021, carried, 0.0005);
    let a = read(&mut files, &n1, &b1);
    let b = read(&mut files, &n2, &b2);

    let request = RunRequest {
        assets: vec![AssetRequest {
            name: "Nifty 50".into(),
            weight: 100.0,
            files: vec![a, b],
            currency: Some("INR".into()),
        }],
        plan: plan(1_000_000.0, 0.0),
        strategies: vec![Strategy::Hold],
        period: Period {
            from: "2020-01-01".into(),
            to: "2021-12-31".into(),
        },
        fx: vec![],
        cpi: vec![],
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
        risk_free: 0.0,
        inflation: 0.0,
    };
    let out = portfolio::run(&request, &files).expect("the run");

    assert_eq!(out.months, 24);
    assert_eq!(out.start_year, 2020);
    assert_eq!(out.month_labels[0], "2020-01");
    assert_eq!(out.month_labels[23], "2021-12");
    // One asset, so its target is the whole portfolio whatever weight was typed.
    assert_eq!(out.assets.len(), 1);
    assert!((out.assets[0].target - 1.0).abs() < 1e-12);
    // Both files' rows are there: two years of weekdays.
    assert!(out.assets[0].rows > 500, "rows {}", out.assets[0].rows);
    assert_eq!(out.assets[0].first, "2020-01-01");

    let r = &out.results[0];
    // A lumpsum and nothing else, so invested never moves and buy-and-hold
    // never trades.
    assert_eq!(r.trades, 0);
    assert_eq!(r.taxes_paid, 0.0);
    assert!((r.invested - 1_000_000.0).abs() < 1e-6);
    // The index only ever rises here, so there is no drawdown and the money's
    // return and the portfolio's agree.
    assert_eq!(r.mdd, 0.0);
    assert!(r.episodes.is_empty());
    assert!((r.xirr - r.twr).abs() < 1e-3, "{} vs {}", r.xirr, r.twr);
    // Value grew by the index: 0.05% a weekday over the whole period.
    assert!(r.r#final > 1_000_000.0);
    // Nothing was sold, so selling at the end is the only tax there is.
    assert!((r.post_tax - (r.r#final - 0.125 * (r.r#final - 1_000_000.0))).abs() < 1.0);
    // And with no CPI series, the run says its inflation was the assumed one.
    assert_eq!(out.inflation_from, "assumed");
}

#[test]
fn a_dollar_asset_needs_a_usd_inr_series() {
    let mut files = Files(HashMap::new());
    let (n1, b1, _) = nse_year("NIFTY 50", 2020, 1000.0, 0.0005);
    let id = read(&mut files, &n1, &b1);
    let request = RunRequest {
        assets: vec![AssetRequest {
            name: "S&P 500".into(),
            weight: 100.0,
            files: vec![id],
            currency: Some("USD".into()),
        }],
        plan: PlanRequest {
            start_month: "2020-01".into(),
            end_month: "2020-12".into(),
            ..plan(100_000.0, 0.0)
        },
        strategies: vec![Strategy::Hold],
        period: Period {
            from: "2020-01-01".into(),
            to: "2020-12-31".into(),
        },
        fx: vec![],
        cpi: vec![],
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
        risk_free: 0.0,
        inflation: 6.0,
    };
    let error = portfolio::run(&request, &files).expect_err("no USD/INR series");
    assert!(error.contains("USD/INR"), "{error}");
}

#[test]
fn a_cpi_series_sets_the_runs_inflation() {
    let mut files = Files(HashMap::new());
    let (n1, b1, _) = nse_year("NIFTY 50", 2020, 1000.0, 0.0005);
    let id = read(&mut files, &n1, &b1);
    // A price index rising 1% a month: 12.68% a year.
    let cpi: Vec<(String, f64)> = (1..=12)
        .map(|m| (format!("2020-{m:02}"), 100.0 * 1.01_f64.powi(m - 1)))
        .collect();
    let request = RunRequest {
        assets: vec![AssetRequest {
            name: "Nifty 50".into(),
            weight: 100.0,
            files: vec![id],
            currency: None,
        }],
        plan: PlanRequest {
            start_month: "2020-01".into(),
            end_month: "2020-12".into(),
            ..plan(100_000.0, 0.0)
        },
        strategies: vec![Strategy::Hold],
        period: Period {
            from: "2020-01-01".into(),
            to: "2020-12-31".into(),
        },
        fx: vec![],
        cpi,
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
        risk_free: 0.0,
        inflation: 6.0,
    };
    let out = portfolio::run(&request, &files).expect("the run");
    assert_eq!(out.inflation_from, "cpi");
    assert!(
        (out.inflation - (1.01_f64.powi(12) - 1.0)).abs() < 1e-6,
        "inflation {}",
        out.inflation
    );
    // The first month's rupee is worth 1.01^11 of the last month's.
    assert!((out.to_today[0] - 1.01_f64.powi(11)).abs() < 1e-9);
    assert!((out.to_today[11] - 1.0).abs() < 1e-12);
    // Real figures sit below nominal ones once inflation is in them.
    let r = &out.results[0];
    assert!(r.twr_real < r.twr);
    assert!(r.xirr_real < r.xirr);
}
