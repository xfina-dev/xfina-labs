//! Reads every file in a folder the way the browser does, and reports what a
//! run would make of them. A development tool: `cargo run --example check_dir -- <folder>`.
use std::collections::BTreeMap;
use std::path::PathBuf;

use xfina::models::ParseRequest;
use xfina_labs_engine::{checks, data::{self, Daily}};

fn main() {
    let dir = PathBuf::from(std::env::args().nth(1).expect("a folder"));
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .expect("readable")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && !p.file_name().unwrap().to_string_lossy().starts_with('.'))
        .collect();
    files.sort();

    let mut by_code: BTreeMap<String, Vec<xfina::models::PriceSeries>> = BTreeMap::new();
    let mut failed = 0;
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        match xfina::parse(ParseRequest::new(&bytes).with_filename(Some(&name))) {
            Ok(st) => match st.data.series() {
                Some(s) => {
                    let field = data::value_field(s);
                    let found = checks::jumps(s, field);
                    for f in &found {
                        println!("  [{}] {name}: {}", f.level, f.message);
                    }
                    by_code
                        .entry(s.code.clone().unwrap_or_else(|| name.clone()))
                        .or_default()
                        .push(s.clone());
                }
                None => {
                    failed += 1;
                    println!("  [err] {name}: not price history");
                }
            },
            Err(e) => {
                failed += 1;
                println!("  [err] {name}: {e}");
            }
        }
    }

    println!("\n{} files, {failed} unreadable\n", files.len());
    for (code, parts) in &by_code {
        let refs: Vec<&xfina::models::PriceSeries> = parts.iter().collect();
        let daily = Daily::stitch(&refs);
        let dates: Vec<_> = daily.0.keys().copied().collect();
        // Weekday gaps the stitched history still has.
        let mut gaps = 0;
        for w in dates.windows(2) {
            if (w[1] - w[0]).num_days() > 7 {
                gaps += 1;
            }
        }
        println!(
            "{code}: {} files, {} values, {} → {}, {gaps} gaps over a week",
            parts.len(),
            dates.len(),
            dates.first().map(|d| d.to_string()).unwrap_or_default(),
            dates.last().map(|d| d.to_string()).unwrap_or_default(),
        );
    }
}
