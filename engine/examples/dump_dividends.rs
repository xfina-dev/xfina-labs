//! Every ex-dividend the parser read from a fund file: date and amount.
//! A development tool: `cargo run --example dump_dividends -- <file>`.
use xfina::models::ParseRequest;

fn main() {
    let path = std::env::args().nth(1).expect("a file");
    let bytes = std::fs::read(&path).unwrap();
    let st = xfina::parse(ParseRequest::new(&bytes).with_filename(Some(&path))).expect("parsed");
    let series = st.data.series().expect("series");
    let mut n = 0;
    for p in &series.rows {
        if let Some(d) = p.dividend {
            if d != rust_decimal::Decimal::ZERO {
                println!("{} {}", p.date, d);
                n += 1;
            }
        }
    }
    eprintln!("{n} non-zero ex-dividends of {} rows", series.rows.len());
}
