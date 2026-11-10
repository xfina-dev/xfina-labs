//! Stitches the same instrument from two folders and compares them where they
//! overlap: `cargo run --example compare_dirs -- <a> <b>`. A development tool.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use xfina::models::{ParseRequest, PriceSeries};
use xfina_labs_engine::data::Daily;

fn read(dir: &Path) -> BTreeMap<String, Vec<PriceSeries>> {
    let mut out: BTreeMap<String, Vec<PriceSeries>> = BTreeMap::new();
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .expect("readable")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && !p.file_name().unwrap().to_string_lossy().starts_with('.'))
        .collect();
    files.sort();
    for path in files {
        let bytes = std::fs::read(&path).unwrap();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        if let Ok(st) = xfina::parse(ParseRequest::new(&bytes).with_filename(Some(&name))) {
            if let Some(s) = st.data.series() {
                out.entry(s.code.clone().unwrap_or(name)).or_default().push(s.clone());
            }
        }
    }
    out
}

fn main() {
    let mut args = std::env::args().skip(1);
    let a = PathBuf::from(args.next().expect("folder a"));
    let b = PathBuf::from(args.next().expect("folder b"));
    let (ra, rb) = (read(&a), read(&b));
    for (code, parts) in &ra {
        let Some(other) = rb.get(code) else { continue };
        let da = Daily::stitch(&parts.iter().collect::<Vec<_>>());
        let db = Daily::stitch(&other.iter().collect::<Vec<_>>());
        let mut shared = 0;
        let mut differ = Vec::new();
        for (date, va) in &da.0 {
            if let Some(vb) = db.0.get(date) {
                shared += 1;
                let rel = (va - vb).abs() / va.abs().max(1e-9);
                if rel > 1e-9 {
                    differ.push((*date, *va, *vb));
                }
            }
        }
        println!(
            "{code}: {} shared dates, {} differ{}",
            shared,
            differ.len(),
            if differ.is_empty() { "" } else { " ←" }
        );
        for (d, x, y) in differ.iter().take(5) {
            println!("   {d}: {x} vs {y}");
        }
        let only_a = da.0.keys().filter(|k| !db.0.contains_key(k)).count();
        let only_b = db.0.keys().filter(|k| !da.0.contains_key(k)).count();
        println!("   only in first: {only_a}, only in second: {only_b}");
    }
}
