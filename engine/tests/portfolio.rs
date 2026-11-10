//! The simulation against arithmetic done by hand.
//!
//! The price grids here are invented and regular on purpose: a run whose
//! returns are known exactly is the only way to tell a real figure from a
//! plausible one.

use std::collections::BTreeMap;

use xfina_labs_engine::data::{Daily, InvestDay, Monthly};
use xfina_labs_engine::portfolio::metrics::{self, Context};
use xfina_labs_engine::portfolio::model::Strategy;
use xfina_labs_engine::portfolio::sim::{self, SimInput};

/// A daily series growing by a fixed rate each month, priced on the 1st and the
/// 28th of every month so both the investment day and the month's end have a
/// value.
fn grid(months: usize, monthly_return: f64, start: f64) -> Monthly {
    let mut points = BTreeMap::new();
    let mut value = start;
    for m in 0..months {
        let year = 2020 + (m / 12) as i32;
        let month = (m % 12) as u32 + 1;
        points.insert(
            chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap(),
            value,
        );
        value *= 1.0 + monthly_return;
        points.insert(
            chrono::NaiveDate::from_ymd_opt(year, month, 28).unwrap(),
            value,
        );
    }
    let daily = Daily(points);
    let end = chrono::NaiveDate::from_ymd_opt(2020 + (months / 12) as i32 + 1, 12, 31).unwrap();
    Monthly::sample(&daily, (2020, 1), months, InvestDay::FirstWorking, end).expect("sampled")
}

fn context<'a>(contribution: &'a [f64], invested: &'a [f64], to_today: &'a [f64]) -> Context<'a> {
    Context {
        contribution,
        invested,
        invested_today: invested,
        to_today,
        months: contribution.len(),
        inflation: 0.0,
        risk_free: 0.0,
    }
}

#[test]
fn one_asset_one_lumpsum_compounds_exactly() {
    let months = 12;
    let g = grid(months, 0.01, 100.0);
    let names = vec!["Only asset".to_string()];
    let targets = vec![1.0];
    let mut contribution = vec![0.0; months];
    contribution[0] = 1_000_000.0;
    let invested: Vec<f64> = contribution
        .iter()
        .scan(0.0, |a, c| {
            *a += c;
            Some(*a)
        })
        .collect();

    let buy = vec![g.buy.clone()];
    let mark = vec![g.mark.clone()];
    let input = SimInput {
        buy: &buy,
        mark: &mark,
        names: &names,
        targets: &targets,
        contribution: &contribution,
        months,
        start_month_of_year: 1,
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
    };
    let out = sim::simulate(&input, &Strategy::Hold);
    // Bought on the 1st at 100, marked on the 28th of each month: twelve
    // months of 1% is 1.01^12.
    let expected = 1_000_000.0 * 1.01_f64.powi(12);
    assert!(
        (out.value[months - 1] - expected).abs() < 1.0,
        "final {} vs {expected}",
        out.value[months - 1]
    );
    assert_eq!(out.trades, 0);
    assert_eq!(out.taxes_paid, 0.0);

    let to_today = vec![1.0; months];
    let result = metrics::describe(
        &Strategy::Hold,
        out,
        &context(&contribution, &invested, &to_today),
    );
    // A single lumpsum left alone: the money's return and the portfolio's are
    // the same, and both are 1.01^12 - 1.
    let annual = 1.01_f64.powi(12) - 1.0;
    assert!((result.twr - annual).abs() < 1e-6, "twr {}", result.twr);
    assert!((result.xirr - annual).abs() < 1e-4, "xirr {}", result.xirr);
    assert_eq!(result.mdd, 0.0);
    assert!(result.vol < 1e-9, "a constant return has no volatility");
}

#[test]
fn buy_and_hold_drifts_and_rebalancing_does_not() {
    let months = 36;
    // One asset doubling the other's growth: the weights must pull apart.
    let fast = grid(months, 0.02, 100.0);
    let slow = grid(months, 0.0, 100.0);
    let names = vec!["Fast".to_string(), "Slow".to_string()];
    let targets = vec![0.5, 0.5];
    let contribution = vec![10_000.0; months];
    let buy = vec![fast.buy.clone(), slow.buy.clone()];
    let mark = vec![fast.mark.clone(), slow.mark.clone()];
    let input = SimInput {
        buy: &buy,
        mark: &mark,
        names: &names,
        targets: &targets,
        contribution: &contribution,
        months,
        start_month_of_year: 1,
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
    };

    let hold = sim::simulate(&input, &Strategy::Hold);
    let drift = hold.weights[months - 1][0] - 0.5;
    // Monthly contributions dilute the drift (they go in at target), so three
    // years of double growth leaves the fast asset a few points over, not ten.
    assert!(drift > 0.05, "buy and hold should drift, got {drift}");
    assert!(hold.rebalances.is_empty());

    let threshold = sim::simulate(
        &input,
        &Strategy::Threshold {
            band_type: "Absolute".into(),
            band_all: 5.0,
            range_own: Default::default(),
        },
    );
    let held = threshold.weights[months - 1][0] - 0.5;
    assert!(
        held.abs() <= drift,
        "rebalancing should hold the weight closer to target: {held} vs {drift}"
    );
    assert!(!threshold.rebalances.is_empty(), "it should have traded");
    assert!(
        threshold.taxes_paid > 0.0,
        "selling a gain realises tax: {}",
        threshold.taxes_paid
    );
    // Every sale is a sale of the overweight asset.
    assert!(threshold
        .transactions
        .iter()
        .filter(|t| t.event == "Sell")
        .all(|t| t.asset == "Fast"));
}

#[test]
fn perpetual_steers_new_money_to_the_underweight() {
    let months = 24;
    let fast = grid(months, 0.03, 100.0);
    let slow = grid(months, 0.0, 100.0);
    let names = vec!["Fast".to_string(), "Slow".to_string()];
    let targets = vec![0.5, 0.5];
    let contribution = vec![50_000.0; months];
    let buy = vec![fast.buy.clone(), slow.buy.clone()];
    let mark = vec![fast.mark.clone(), slow.mark.clone()];
    let input = SimInput {
        buy: &buy,
        mark: &mark,
        names: &names,
        targets: &targets,
        contribution: &contribution,
        months,
        start_month_of_year: 1,
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
    };
    let out = sim::simulate(
        &input,
        &Strategy::Perpetual {
            max_drift: 10.0,
            min_drift: 5.0,
            sell_months: 6.0,
            ltcg_only: "Yes".into(),
        },
    );
    // After the first month every rupee should go to the laggard.
    let later: Vec<_> = out
        .transactions
        .iter()
        .filter(|t| t.event == "Buy" && t.month == 3)
        .collect();
    let into_slow: f64 = later.iter().filter(|t| t.asset == "Slow").map(|t| t.amount).sum();
    let into_fast: f64 = later.iter().filter(|t| t.asset == "Fast").map(|t| t.amount).sum();
    assert!(
        into_slow > into_fast,
        "new money should fill the underweight: {into_slow} vs {into_fast}"
    );
    // And with LTCG-only on, nothing is sold in the first year.
    assert!(out
        .transactions
        .iter()
        .filter(|t| t.event == "Sell")
        .all(|t| t.month >= 12));
}

#[test]
fn calendar_trades_only_in_its_month() {
    let months = 30;
    let fast = grid(months, 0.02, 100.0);
    let slow = grid(months, 0.0, 100.0);
    let names = vec!["Fast".to_string(), "Slow".to_string()];
    let targets = vec![0.5, 0.5];
    let contribution = vec![10_000.0; months];
    let buy = vec![fast.buy.clone(), slow.buy.clone()];
    let mark = vec![fast.mark.clone(), slow.mark.clone()];
    let input = SimInput {
        buy: &buy,
        mark: &mark,
        names: &names,
        targets: &targets,
        contribution: &contribution,
        months,
        start_month_of_year: 1,
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
    };
    let out = sim::simulate(
        &input,
        &Strategy::Calendar {
            frequency: "Annual".into(),
            month: "January".into(),
        },
    );
    // The run starts in January 2020, so the rebalances fall in month 12 and 24.
    assert_eq!(out.rebalances, vec![12, 24]);
}

#[test]
fn a_fall_shows_up_as_a_drawdown_that_recovers() {
    // Up for a year, down 19% over two months, then back up for long enough to
    // climb out of it.
    let months = 30;
    let mut points = BTreeMap::new();
    let mut value: f64 = 100.0;
    for m in 0..months {
        let year = 2020 + (m / 12) as i32;
        let month = (m % 12) as u32 + 1;
        points.insert(
            chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap(),
            value,
        );
        value *= if m == 12 || m == 13 { 0.9 } else { 1.02 };
        points.insert(
            chrono::NaiveDate::from_ymd_opt(year, month, 28).unwrap(),
            value,
        );
    }
    let daily = Daily(points);
    let end = chrono::NaiveDate::from_ymd_opt(2024, 12, 31).unwrap();
    let g = Monthly::sample(&daily, (2020, 1), months, InvestDay::FirstWorking, end).unwrap();
    let names = vec!["Only".to_string()];
    let targets = vec![1.0];
    let mut contribution = vec![0.0; months];
    contribution[0] = 100_000.0;
    let invested: Vec<f64> = contribution
        .iter()
        .scan(0.0, |a, c| {
            *a += c;
            Some(*a)
        })
        .collect();
    let buy = vec![g.buy.clone()];
    let mark = vec![g.mark.clone()];
    let input = SimInput {
        buy: &buy,
        mark: &mark,
        names: &names,
        targets: &targets,
        contribution: &contribution,
        months,
        start_month_of_year: 1,
        ltcg_rate: 12.5,
        stcg_rate: 20.0,
    };
    let out = sim::simulate(&input, &Strategy::Hold);
    let to_today = vec![1.0; months];
    let result = metrics::describe(
        &Strategy::Hold,
        out,
        &context(&contribution, &invested, &to_today),
    );
    // Two months of −10% compounded is −19%.
    assert!(
        (result.mdd - (0.9 * 0.9 - 1.0)).abs() < 1e-6,
        "mdd {}",
        result.mdd
    );
    let worst = result.episodes.first().expect("one episode");
    assert_eq!(worst.trough, 13);
    // 0.81 back above 1 at 2% a month takes ten more months, and the run has
    // twelve left, so the episode closes inside it.
    assert_eq!(worst.recovered, Some(24), "it should recover in month 24");
    assert!(result.vol > 0.0);
}
