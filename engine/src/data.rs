//! The data half: what `xfina` read, turned into something the simulation can
//! step through month by month.
//!
//! `xfina` reads exactly one file per call and says so loudly: a dataset that
//! arrives in pieces -- a year of NSE index history per download, five years of
//! AMFI NAVs -- comes back as one series per piece, and putting the pieces
//! together is explicitly left to whoever holds them all. That is this module.
//! It also does the two other things no parser can do for us: convert a series
//! quoted in dollars into rupees, and sample a daily series onto the monthly
//! grid the backtest runs on.

use std::collections::BTreeMap;

use chrono::{Datelike, Duration, NaiveDate};
use rust_decimal::prelude::ToPrimitive;

use xfina::models::{Field, PriceSeries};

/// A dataset as one continuous daily history: date -> value, ascending.
///
/// Built from one or more parsed files of the same dataset. Where two files
/// overlap the later one wins, which is what a re-download of a corrected
/// window is for.
#[derive(Debug, Clone, Default)]
pub struct Daily(pub BTreeMap<NaiveDate, f64>);

/// The column a backtest takes as a series' value.
///
/// A file's headline is what the publisher calls its value -- `nav` for a NAV
/// history, `totalReturn` for a total return index, `close` for a traded
/// price. For a backtest, where income has to be in the return, the
/// publisher's own adjusted twin of that column is the one to use where the
/// file prints one: Tiingo's `adjClose` next to its as-traded `close`, an
/// issuer's `adjNav` next to its `nav`. Both are the publisher's figures, as
/// printed -- `xfina` never computes an adjustment -- so this picks between
/// two columns of the same file and computes nothing either.
///
/// The adjusted column is taken only when the file prints it for the series as
/// a whole, never row by row: two columns on different scales spliced into one
/// history would invent a return on the day they met.
pub fn value_field(series: &PriceSeries) -> Field {
    let adjusted = match series.headline {
        Field::Close => Some(Field::AdjClose),
        Field::Nav => Some(Field::AdjNav),
        _ => None,
    };
    match adjusted {
        Some(field) if series.fields.contains(&field) => field,
        _ => series.headline,
    }
}

impl Daily {
    /// Stitches parsed files into one history, each file read at the column
    /// [`value_field`] picks.
    pub fn stitch(parts: &[&PriceSeries]) -> Self {
        let mut out = BTreeMap::new();
        for series in parts {
            let field = value_field(series);
            // Rows are ascending by date and then by time, so for a publisher
            // that polls (MCX) the last write for a date is that day's last
            // reading, which is its close.
            for row in &series.rows {
                if let Some(v) = row.get(field).and_then(|d| d.to_f64()) {
                    if v > 0.0 {
                        out.insert(row.date, v);
                    }
                }
            }
        }
        Daily(out)
    }

    /// From plain `(date, value)` pairs -- the two-column CSVs Xfina Data
    /// publishes for USD/INR and CPI, which the page fetches itself.
    pub fn from_points(points: &[(NaiveDate, f64)]) -> Self {
        Daily(points.iter().copied().filter(|(_, v)| *v > 0.0).collect())
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn first(&self) -> Option<NaiveDate> {
        self.0.keys().next().copied()
    }

    pub fn last(&self) -> Option<NaiveDate> {
        self.0.keys().next_back().copied()
    }

    /// The latest value on or before `on`.
    ///
    /// Carried forward, never interpolated and never extrapolated backwards: a
    /// value is a value somebody published, and a date before the first one has
    /// no value at all.
    pub fn at(&self, on: NaiveDate) -> Option<f64> {
        self.0.range(..=on).next_back().map(|(_, v)| *v)
    }

    /// The earliest value on or after `on`, for an investment day that falls on
    /// a holiday.
    pub fn at_or_after(&self, on: NaiveDate) -> Option<(NaiveDate, f64)> {
        self.0.range(on..).next().map(|(d, v)| (*d, *v))
    }

    /// Divides this series by another, date by date: a dollar history and a
    /// USD/INR history make a rupee history.
    pub fn times(&self, other: &Daily) -> Daily {
        Daily(
            self.0
                .iter()
                .filter_map(|(d, v)| other.at(*d).map(|r| (*d, v * r)))
                .collect(),
        )
    }
}

/// Where in a month money goes in, as the plan's "Investment day" names it.
#[derive(Debug, Clone, Copy)]
pub enum InvestDay {
    FirstWorking,
    LastWorking,
    Nth(u32),
}

impl InvestDay {
    pub fn parse(label: &str) -> Self {
        match label {
            "First working day" => InvestDay::FirstWorking,
            "Last working day" => InvestDay::LastWorking,
            other => other
                .trim_end_matches(|c: char| c.is_ascii_alphabetic())
                .parse::<u32>()
                .map(|n| InvestDay::Nth(n.clamp(1, 31)))
                .unwrap_or(InvestDay::FirstWorking),
        }
    }

    /// The calendar date this day falls on in a given month. A day past the end
    /// of a short month is that month's last day; which trading day the price
    /// then comes from is the series' business, not the calendar's.
    pub fn date_in(&self, year: i32, month: u32) -> NaiveDate {
        let first = NaiveDate::from_ymd_opt(year, month, 1).expect("a valid month");
        let last = month_end(year, month);
        match self {
            InvestDay::FirstWorking => first,
            InvestDay::LastWorking => last,
            InvestDay::Nth(n) => NaiveDate::from_ymd_opt(year, month, *n).unwrap_or(last),
        }
    }
}

pub fn month_end(year: i32, month: u32) -> NaiveDate {
    let (y, m) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(y, m, 1).expect("a valid month") - Duration::days(1)
}

/// `YYYY-MM` for a month index counted from a starting month.
pub fn month_label(start_year: i32, start_month: u32, index: usize) -> String {
    let (y, m) = year_month(start_year, start_month, index);
    format!("{y}-{m:02}")
}

pub fn year_month(start_year: i32, start_month: u32, index: usize) -> (i32, u32) {
    let total = (start_month as i64 - 1) + index as i64;
    (
        start_year + (total / 12) as i32,
        (total % 12) as u32 + 1,
    )
}

/// Months from one `YYYY-MM` to another, both included.
pub fn months_between(from: (i32, u32), to: (i32, u32)) -> usize {
    let n = (to.0 - from.0) * 12 + to.1 as i32 - from.1 as i32 + 1;
    n.max(0) as usize
}

/// A dataset sampled onto the run's monthly grid.
///
/// Two prices a month, because a contribution and a valuation are not the same
/// event: `buy` is the price on the plan's investment day (the first published
/// value on or after it, so a holiday does not lose a month), and `mark` the
/// last published value in the month, which is what the portfolio is worth at
/// the month's end.
#[derive(Debug, Clone)]
pub struct Monthly {
    pub buy: Vec<f64>,
    pub mark: Vec<f64>,
}

impl Monthly {
    pub fn sample(
        daily: &Daily,
        start: (i32, u32),
        months: usize,
        day: InvestDay,
        run_end: NaiveDate,
    ) -> Option<Monthly> {
        let mut buy = Vec::with_capacity(months);
        let mut mark = Vec::with_capacity(months);
        for m in 0..months {
            let (y, mo) = year_month(start.0, start.1, m);
            let wanted = day.date_in(y, mo);
            // The investment day's own price where there is one, the next
            // published one otherwise, and failing both (the last month of a
            // run that ends mid-month) the latest value there is.
            let b = daily
                .at(wanted)
                .filter(|_| daily.0.contains_key(&wanted))
                .or_else(|| {
                    daily
                        .at_or_after(wanted)
                        .filter(|(d, _)| *d <= run_end)
                        .map(|(_, v)| v)
                })
                .or_else(|| daily.at(wanted))?;
            let end = month_end(y, mo).min(run_end);
            let k = daily.at(end)?;
            buy.push(b);
            mark.push(k);
        }
        Some(Monthly { buy, mark })
    }
}

/// What a series covers, for the page's own report on an imported file.
pub fn iso(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

/// The column a series is read at, named as the page names it.
pub fn basis_of(field: Field) -> &'static str {
    match field {
        Field::Nav => "NAV",
        Field::AdjNav => "NAV, adjusted for distributions",
        Field::TotalReturn => "Total return index",
        Field::NetTotalReturn => "Net total return index",
        Field::Close => "Market price",
        Field::AdjClose => "Market price, adjusted for splits and dividends",
        _ => field.as_str(),
    }
}

/// Whether a column already has income in it, which is what a backtest needs.
pub fn includes_income(field: Field) -> bool {
    matches!(
        field,
        Field::TotalReturn
            | Field::NetTotalReturn
            | Field::AdjClose
            | Field::AdjNav
            | Field::Nav
    )
}

/// A month index for a date, counted from the run's first month.
pub fn month_index(start: (i32, u32), date: NaiveDate) -> i64 {
    (date.year() - start.0) as i64 * 12 + date.month() as i64 - start.1 as i64
}
