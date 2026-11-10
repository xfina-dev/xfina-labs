//! What a file has to survive before a run will use it.
//!
//! `xfina` reads a publisher's file faithfully and validates it against what
//! the file itself declares. It does not, and should not, judge whether the
//! numbers make sense as a price history: that is a question about the series,
//! not about the format, and the answer depends on what the series is for.
//!
//! A backtest is unusually sensitive to one thing in particular. A fund that
//! splits its units ten for one prints a NAV of 4,543 one day and 454 the
//! next, and AMFI's export records no split. Read literally that is a 90% loss
//! in a liquid fund, and every figure downstream -- the drawdown, the
//! volatility, the final value -- is then wrong by an order of magnitude while
//! looking perfectly well-formed. So a jump that is a round multiple, with no
//! split recorded against it, makes the file unusable until it is replaced,
//! and any other implausible jump is called out.

use chrono::NaiveDate;

use xfina::models::{Field, Frequency, PriceSeries};

/// A finding about a series, in the shape the page lists checks in.
pub struct Finding {
    pub level: &'static str,
    pub message: String,
}

/// The widest gap between two rows that is still worth comparing: past it, the
/// move says more about the gap than about the price.
fn max_gap(frequency: Frequency) -> Option<i64> {
    match frequency {
        Frequency::Intraday | Frequency::Daily => Some(7),
        Frequency::Monthly => Some(45),
        Frequency::Irregular => None,
    }
}

/// Day-over-day moves large enough to need explaining, and dates the file
/// gives more than one value for.
pub fn jumps(series: &PriceSeries, field: Field) -> Vec<Finding> {
    let Some(limit) = max_gap(series.frequency) else {
        return Vec::new();
    };
    let rows: Vec<(NaiveDate, f64, bool)> = series
        .rows
        .iter()
        .filter_map(|r| {
            use rust_decimal::prelude::ToPrimitive;
            let v = r.get(field)?.to_f64()?;
            (v > 0.0).then_some((r.date, v, r.split_factor.is_some()))
        })
        .collect();

    let mut out = Vec::new();

    // The same date twice with two different values is two series in one file,
    // and nothing downstream can tell which value was meant -- unless the
    // publisher polls, which MCX does: several readings a day is what an
    // intraday series is, and the day's last one is its close.
    let mut duplicates = Vec::new();
    if series.frequency != Frequency::Intraday {
        for pair in rows.windows(2) {
            if pair[0].0 == pair[1].0
                && (pair[0].1 - pair[1].1).abs() > f64::EPSILON * pair[0].1.abs()
            {
                duplicates.push(pair[0].0);
            }
        }
    }
    if !duplicates.is_empty() {
        out.push(Finding {
            level: "err",
            message: format!(
                "{} date{} carry more than one value ({}{}). The file holds more than one series, and which value a run should use cannot be told from it.",
                duplicates.len(),
                if duplicates.len() == 1 { "" } else { "s" },
                duplicates
                    .iter()
                    .take(3)
                    .map(|d| d.to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                if duplicates.len() > 3 { ", …" } else { "" },
            ),
        });
    }

    for pair in rows.windows(2) {
        let (before, previous, _) = pair[0];
        let (after, current, recorded) = pair[1];
        if after == before || (after - before).num_days() > limit {
            continue;
        }
        // A split the file records is an explained move, whatever its size.
        if recorded {
            continue;
        }
        let ratio = current / previous;
        // What an index, an ETF or a fund can do in a day and still be itself.
        // Black Monday 1987 was −20.5%, the worst day the sample data holds;
        // past a quarter in either direction, something wants explaining.
        if (0.75..1.3333).contains(&ratio) {
            continue;
        }
        let factor = if ratio < 1.0 { 1.0 / ratio } else { ratio };
        let nearest = factor.round();
        // A round multiple is a split; anything else is a move to look at.
        let split_like = nearest >= 2.0 && ((factor - nearest).abs() / nearest) < 0.02;
        if split_like {
            out.push(Finding {
                level: "err",
                message: format!(
                    "{} on {}: {:.0} for {:.0}, with no split recorded against it. Values before and after are on different scales, so the series would show a {:.0}% {} on that day. Replace this file with one that covers the split, or leave this series out.",
                    if ratio < 1.0 { "A fall of almost exactly a round multiple" } else { "A rise of almost exactly a round multiple" },
                    after,
                    if ratio < 1.0 { nearest } else { 1.0 },
                    if ratio < 1.0 { 1.0 } else { nearest },
                    (ratio - 1.0).abs() * 100.0,
                    if ratio < 1.0 { "fall" } else { "rise" },
                ),
            });
        } else {
            out.push(Finding {
                level: "warn",
                message: format!(
                    "A move of {}{:.1}% on {} ({:.4} to {:.4}). Plausible, but check it against your source.",
                    if ratio > 1.0 { "+" } else { "−" },
                    (ratio - 1.0).abs() * 100.0,
                    after,
                    previous,
                    current,
                ),
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use std::str::FromStr;
    use xfina::detect::Format;
    use xfina::models::{InstrumentKind, PricePoint};

    fn series(values: &[(&str, &str)]) -> PriceSeries {
        let rows: Vec<PricePoint> = values
            .iter()
            .map(|(d, v)| {
                let mut p = PricePoint::new(NaiveDate::parse_from_str(d, "%Y-%m-%d").unwrap());
                p.nav = Some(Decimal::from_str(v).unwrap());
                p
            })
            .collect();
        PriceSeries {
            source: Format::MarketAmfiNav,
            code: Some("A fund".into()),
            name: None,
            kind: Some(InstrumentKind::MutualFund),
            currency: Some("INR".into()),
            unit: None,
            frequency: Frequency::Daily,
            fields: vec![Field::Nav],
            extra_fields: vec![],
            split_adjusted: None,
            headline: Field::Nav,
            rows,
            declared_range: None,
        }
    }

    #[test]
    fn a_ten_for_one_split_with_nothing_recorded_makes_the_file_unusable() {
        // The real shape of it: a liquid fund's NAV, then a 1:10 unit split.
        let s = series(&[
            ("2026-06-18", "4542.9"),
            ("2026-06-19", "4543.7279"),
            ("2026-06-20", "454.4497"),
            ("2026-06-21", "454.5"),
        ]);
        let found = jumps(&s, Field::Nav);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].level, "err");
        assert!(found[0].message.contains("2026-06-20"), "{}", found[0].message);
        assert!(found[0].message.contains("no split recorded"));
    }

    #[test]
    fn a_split_the_file_records_is_not_a_fault() {
        let mut s = series(&[("2026-06-19", "4543.7279"), ("2026-06-20", "454.4497")]);
        s.rows[1].split_factor = Some(Decimal::from_str("0.1").unwrap());
        assert!(jumps(&s, Field::Nav).is_empty());
    }

    #[test]
    fn an_ordinary_crash_is_a_note_not_a_fault() {
        let s = series(&[("2020-03-23", "100"), ("2020-03-24", "62")]);
        let found = jumps(&s, Field::Nav);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].level, "warn");
        assert!(found[0].message.contains("38.0%"), "{}", found[0].message);
    }

    #[test]
    fn ordinary_days_say_nothing() {
        let s = series(&[
            ("2026-01-01", "100"),
            ("2026-01-02", "101"),
            ("2026-01-05", "99"),
            ("2026-01-06", "103"),
        ]);
        assert!(jumps(&s, Field::Nav).is_empty());
    }

    #[test]
    fn a_move_across_a_long_gap_is_not_judged() {
        // Two years apart: the move says nothing about either day.
        let s = series(&[("2020-01-01", "100"), ("2022-01-03", "300")]);
        assert!(jumps(&s, Field::Nav).is_empty());
    }

    #[test]
    fn a_polled_series_may_have_several_readings_a_day() {
        // MCX publishes a spot price several times a day; the day's last
        // reading is its close, and the repeats are not a fault.
        let mut s = series(&[
            ("2026-09-01", "100"),
            ("2026-09-01", "101"),
            ("2026-09-02", "102"),
        ]);
        s.frequency = Frequency::Intraday;
        assert!(jumps(&s, Field::Nav).is_empty());
    }

    #[test]
    fn one_date_with_two_values_is_two_series_in_one_file() {
        let s = series(&[
            ("2026-01-01", "100"),
            ("2026-01-01", "1050"),
            ("2026-01-02", "101"),
        ]);
        let found = jumps(&s, Field::Nav);
        assert!(found.iter().any(|f| f.level == "err" && f.message.contains("more than one value")), "{:?}", found.iter().map(|f| &f.message).collect::<Vec<_>>());
    }
}
