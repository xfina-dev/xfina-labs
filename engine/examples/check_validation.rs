//! What the parsers' own cross-checks say about a folder of files, in detail.
//! A development tool: `cargo run --example check_validation -- <folder>`.
use std::path::PathBuf;

use xfina::models::validation::ValidationStatus;
use xfina::models::ParseRequest;

fn main() {
    let dir = PathBuf::from(std::env::args().nth(1).expect("a folder"));
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .expect("readable")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && !p.file_name().unwrap().to_string_lossy().starts_with('.'))
        .collect();
    files.sort();
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        match xfina::parse(ParseRequest::new(&bytes).with_filename(Some(&name))) {
            Ok(st) => {
                let v = &st.validation;
                println!("\n{name}\n  overall: {:?}", v.overall);
                if !matches!(v.overall, ValidationStatus::Passed) {
                    println!("  row level: passed={}", v.row_level.passed);
                }
                for group in [&v.summary_level.declared, &v.summary_level.derived] {
                    for c in &group.checks {
                        println!(
                            "  [{}] {} declared={:?} computed={} delta={:?} note={:?}",
                            if c.passed { "ok " } else { "FAIL" },
                            c.name,
                            c.declared,
                            c.computed,
                            c.delta,
                            c.note
                        );
                    }
                }
            }
            Err(e) => println!("\n{name}\n  parse error: {e}"),
        }
    }
}
