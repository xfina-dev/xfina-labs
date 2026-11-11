//! What each file in a folder calls its instrument: the publisher, the code and
//! the name a match is made on. A development tool, for checking that the
//! catalogue's names survive a round trip against what publishers print:
//! `cargo run --example dump_names -- <folder>...`
use std::path::PathBuf;

use xfina::models::ParseRequest;

fn main() {
    for dir in std::env::args().skip(1) {
        let dir = PathBuf::from(dir);
        let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
            .expect("readable")
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && !p.file_name().unwrap().to_string_lossy().starts_with('.'))
            .collect();
        files.sort();
        let mut seen = std::collections::BTreeSet::new();
        for path in &files {
            let bytes = std::fs::read(path).unwrap();
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            if let Ok(st) = xfina::parse(ParseRequest::new(&bytes).with_filename(Some(&name))) {
                if let Some(s) = st.data.series() {
                    seen.insert(format!(
                        "{:16} code={:?} name={:?}",
                        st.format.id(),
                        s.code,
                        s.name
                    ));
                }
            }
        }
        println!("\n== {}", dir.display());
        for line in seen {
            println!("  {line}");
        }
    }
}
