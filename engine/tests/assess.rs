//! What makes an imported file unusable, and what is only worth saying.
//!
//! Regression: iShares' 0-1 Year Treasury fund declared 48 distributions of
//! **zero** through 2021-22, when a fund of one-year treasuries paid nothing.
//! Its Distributions sheet lists them as 0 and its price history prints 0
//! against the same dates, so the file is exactly consistent -- but a zero is
//! not stored as a dividend (`price()` drops it), so the publisher's own check
//! counts those 48 as missing and the file came back `Failed`. Labs turned that
//! into "Invalid" and refused a clean twenty-year, 4,998-row NAV series.
//!
//! A backtest reads one thing from a file: the value path. Whether the
//! publisher's bookkeeping ties out says nothing about whether that path is
//! sound, so it is a note with its numbers in it. What blocks a file is decided
//! on the series itself: no values at all, or a scale break in the path.

use chrono::NaiveDate;
use rust_decimal::Decimal;

use xfina::detect::Format;
use xfina::models::series::{Field, Frequency, PricePoint, PriceSeries};
use xfina::models::validation::{SummaryCheck, ValidationReport};
use xfina_labs_engine::assess;

/// A sound NAV series: one value a day, rising gently, nothing to object to.
fn series(days: u32, step: f64) -> PriceSeries {
    let mut rows = Vec::new();
    let mut nav = 100.0_f64;
    for d in 0..days {
        let date = NaiveDate::from_ymd_opt(2021, 1, 1).unwrap() + chrono::Days::new(d as u64);
        let mut p = PricePoint::new(date);
        p.nav = Decimal::from_str_exact(&format!("{nav:.6}")).ok();
        rows.push(p);
        nav *= 1.0 + step;
    }
    PriceSeries {
        source: Format::MarketIshares,
        code: Some("iShares 0-1 Year Treasury Bond ETF".into()),
        name: None,
        kind: None,
        currency: Some("USD".into()),
        unit: None,
        frequency: Frequency::Daily,
        fields: vec![Field::Nav],
        extra_fields: Vec::new(),
        split_adjusted: None,
        headline: Field::Nav,
        rows,
        declared_range: None,
    }
}

/// A report whose one declared check did not reconcile, as iShares' does.
fn distributions_out(listed: u64, matched: u64) -> ValidationReport {
    let mut report = ValidationReport::empty();
    report.summary_level.checks.push(SummaryCheck::declared(
        "distributions_match_ex_dividends",
        Decimal::from(listed),
        Decimal::from(matched),
        Some("distributions on the Distributions sheet found on their ex-date".to_string()),
    ));
    report.finalize();
    report
}

#[test]
fn a_failed_cross_check_is_a_note_not_a_wall() {
    // A fund of one-year treasuries through the zero-rate years: the value path
    // moves by almost nothing a day, which is exactly the series that used to
    // be refused.
    let (status, checks) = assess(&series(60, 0.00002), &distributions_out(238, 190));
    assert_eq!(status, "warn", "a clean value path must stay usable: {checks:#?}");
    let note = checks
        .iter()
        .find(|(_, m)| m.contains("distributions"))
        .expect("the failed check is reported");
    assert_eq!(note.0, "warn");
    // The numbers it compared are in the message, so the user can judge how far
    // out it is instead of being told only that something did not add up.
    assert!(note.1.contains("238"), "{}", note.1);
    assert!(note.1.contains("190"), "{}", note.1);
    assert!(note.1.contains("48"), "{}", note.1);
}

#[test]
fn a_file_that_reconciles_says_nothing() {
    let mut passing = ValidationReport::empty();
    passing.finalize();
    let (status, checks) = assess(&series(60, 0.00002), &passing);
    assert_eq!(status, "ok");
    assert!(
        checks.iter().all(|(level, _)| level == "ok"),
        "{checks:#?}"
    );
}

#[test]
fn what_still_blocks_a_file() {
    // No values at all: nothing to run on.
    let empty = PriceSeries { rows: Vec::new(), ..series(1, 0.0) };
    let mut passing = ValidationReport::empty();
    passing.finalize();
    let (status, _) = assess(&empty, &passing);
    assert_eq!(status, "err");

    // A scale break in the path itself -- an unrecorded split -- still blocks,
    // whatever the publisher's own checks say (checks.rs).
    let mut split = series(40, 0.0001);
    for p in split.rows.iter_mut().skip(20) {
        p.nav = p.nav.map(|v| v / Decimal::from(10));
    }
    let (status, checks) = assess(&split, &passing);
    assert_eq!(status, "err", "{checks:#?}");
}
