//! The Portfolio Engine's WebAssembly module.
//!
//! One module, two halves, composed here and nowhere else:
//!
//! - [`read_file`] hands a file's bytes to `xfina`, which works out which
//!   publisher's download it is and reads it into a price series. The series
//!   stays in this module's session store and the caller gets a handle plus
//!   what the file covers -- first and last date, rows with a value, gaps, and
//!   the checks the page shows per file.
//! - [`run`] takes those handles with an allocation, a contribution plan and
//!   the rebalancing strategies to try, and returns a full backtest.
//!
//! Keeping the parsed series on this side is the point of the handle: a
//! twenty-year daily history crosses the WASM boundary once, as bytes, instead
//! of once per run as JSON.
//!
//! Nothing here reaches the network or the disk. The page reads the files the
//! user picked and passes the bytes; everything else is arithmetic.

use std::cell::RefCell;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use xfina::models::{ParseRequest, PriceSeries, ValidationStatus};

pub mod data;
pub mod portfolio;

use portfolio::model::RunRequest;
use portfolio::SeriesSource;

// -----------------------------------------------------------------------------
// The session store
// -----------------------------------------------------------------------------

thread_local! {
    static STORE: RefCell<Store> = RefCell::new(Store::default());
}

#[derive(Default)]
struct Store {
    next: u64,
    series: HashMap<String, PriceSeries>,
}

impl SeriesSource for Store {
    fn get(&self, id: &str) -> Option<&PriceSeries> {
        self.series.get(id)
    }
}

// -----------------------------------------------------------------------------
// Reading a file
// -----------------------------------------------------------------------------

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct ReadOptions {
    filename: Option<String>,
    modified_timestamp: Option<i64>,
    /// Read as this `xfina` format instead of detecting one.
    #[serde(rename = "as")]
    as_format: Option<String>,
}

/// What one imported file turned out to be, in the terms Select Assets shows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileReport {
    /// The handle a run refers to this series by.
    id: String,
    filename: Option<String>,
    /// The `xfina` format id, e.g. `md-nse-indices`.
    source: String,
    /// The publisher, as `xfina` names it.
    publisher: String,
    /// The exchange symbol, ticker, index name or fund name in the file.
    code: Option<String>,
    name: Option<String>,
    /// `index`, `etf`, `mutual_fund`, `listed_security`, `commodity_spot`.
    kind: Option<String>,
    currency: String,
    /// The column that is this series' value, and what it means.
    headline: String,
    basis: String,
    /// `Total return` where the headline column includes income, `Price only`
    /// where it does not.
    ret: String,
    frequency: String,
    /// From the rows themselves, never from the filename.
    from: Option<String>,
    to: Option<String>,
    rows: usize,
    /// `ok`, `warn` or `err`, as the file's row in Select Assets colours it.
    status: String,
    /// `[level, sentence]`, the page's own shape.
    checks: Vec<(String, String)>,
}

/// Reads one market data file: AMFI NAV history, an NSE index or security
/// archive, MCX spot, an iShares or SPDR sheet, Tiingo, WSJ, MSCI, Nasdaq or
/// Yahoo. Returns `{ error: { kind, message } }` rather than throwing, so the
/// caller branches on `kind`.
#[wasm_bindgen(js_name = readFile)]
pub fn read_file(bytes: &[u8], options: JsValue) -> Result<JsValue, JsValue> {
    let options: ReadOptions = from_js(options)?;
    let format = match options.as_format.as_deref() {
        None => None,
        Some(id) => Some(
            xfina::detect::Format::from_id(id)
                .ok_or_else(|| JsValue::from_str(&format!("Unknown format '{id}'")))?,
        ),
    };
    let request = ParseRequest::new(bytes)
        .with_filename(options.filename.as_deref())
        .with_modified_timestamp(options.modified_timestamp)
        .with_format(format);

    let statement = match xfina::parse(request) {
        Ok(statement) => statement,
        Err(e) => {
            return to_js(&serde_json::json!({
                "error": { "kind": e.kind(), "message": e.to_string() }
            }))
        }
    };

    let series = match statement.data.series() {
        Some(series) => series.clone(),
        None => {
            return to_js(&serde_json::json!({ "error": {
                "kind": "unsupported",
                "message": format!(
                    "{} is a {} statement, not price history. The Portfolio Engine reads published price, NAV and index history.",
                    options.filename.clone().unwrap_or_else(|| "This file".into()),
                    statement.institution(),
                ),
            } }));
        }
    };

    let coverage = series.coverage();
    let mut checks: Vec<(String, String)> = Vec::new();

    // A file with no values at all cannot be used; everything else is a note.
    let mut status = if coverage.rows == 0 {
        checks.push((
            "err".into(),
            "No rows carry a value. The download may have fetched an empty range.".into(),
        ));
        "err"
    } else {
        "ok"
    };

    // What the parsers themselves found, in the page's words.
    match statement.validation.overall {
        ValidationStatus::Failed => {
            status = "err";
            checks.push((
                "err".into(),
                "A figure the file prints cannot be reproduced from its rows. Replace the file.".into(),
            ));
        }
        ValidationStatus::Warning => {
            if status != "err" {
                status = "warn";
            }
            checks.push((
                "warn".into(),
                "A derived cross-check did not reconcile exactly. Usually rounding; check it against your source."
                    .into(),
            ));
        }
        ValidationStatus::Passed => {}
    }

    // The gaps the series itself reports: longer than its frequency explains.
    if !coverage.gaps.is_empty() {
        if status == "ok" {
            status = "warn";
        }
        let shown: Vec<String> = coverage
            .gaps
            .iter()
            .take(3)
            .map(|g| format!("{} → {} ({} days)", g.after, g.before, g.days))
            .collect();
        checks.push((
            "warn".into(),
            format!(
                "{} gap{} longer than the series' frequency explains: {}{}. Values are carried forward; no return is created on those days.",
                coverage.gaps.len(),
                if coverage.gaps.len() == 1 { "" } else { "s" },
                shown.join(", "),
                if coverage.gaps.len() > 3 { ", …" } else { "" },
            ),
        ));
    }

    // The range the file declares against the rows it actually holds.
    if let (Some(declared), Some(first), Some(last)) =
        (series.declared_range, coverage.first, coverage.last)
    {
        if first < declared.from || last > declared.to {
            if status == "ok" {
                status = "warn";
            }
            checks.push((
                "warn".into(),
                format!(
                    "The file says it covers {} → {} but holds rows from {} to {}.",
                    declared.from, declared.to, first, last
                ),
            ));
        }
    }

    if checks.is_empty() {
        checks.push((
            "ok".into(),
            format!(
                "{} rows, sorted, no duplicate dates, all values positive.",
                coverage.rows
            ),
        ));
    }

    // The column a run reads this file at, which is the publisher's adjusted
    // twin of its headline where it prints one: see data::value_field.
    let headline = data::value_field(&series);
    let report = FileReport {
        id: String::new(), // filled below, once the series is stored
        filename: options.filename.clone(),
        source: statement.format.id().to_string(),
        publisher: statement.institution().to_string(),
        code: series.code.clone(),
        name: series.name.clone(),
        kind: series
            .kind
            .and_then(|k| serde_json::to_value(k).ok())
            .and_then(|v| v.as_str().map(|s| s.to_string())),
        currency: series.currency.clone().unwrap_or_else(|| "INR".into()),
        headline: headline.as_str().to_string(),
        basis: data::basis_of(headline).to_string(),
        ret: if data::includes_income(headline) {
            "Total return".to_string()
        } else {
            "Price only".to_string()
        },
        frequency: serde_json::to_value(series.frequency)
            .ok()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "irregular".into()),
        from: coverage.first.map(|d| d.to_string()),
        to: coverage.last.map(|d| d.to_string()),
        rows: coverage.rows,
        status: status.to_string(),
        checks,
    };

    let id = STORE.with(|store| {
        let mut store = store.borrow_mut();
        store.next += 1;
        let id = format!("s{}", store.next);
        store.series.insert(id.clone(), series);
        id
    });

    to_js(&serde_json::json!(FileReport { id, ..report }))
}

/// Forgets one imported file.
#[wasm_bindgen(js_name = dropFile)]
pub fn drop_file(id: &str) {
    STORE.with(|store| {
        store.borrow_mut().series.remove(id);
    });
}

/// Forgets every imported file, for a page that is starting over.
#[wasm_bindgen(js_name = clearFiles)]
pub fn clear_files() {
    STORE.with(|store| {
        let mut store = store.borrow_mut();
        store.series.clear();
    });
}

/// One imported file as CSV, in Tiingo's column layout -- `xfina`'s own
/// rendering, so every Xfina surface writes the same file.
#[wasm_bindgen(js_name = fileCsv)]
pub fn file_csv(id: &str) -> Result<String, JsValue> {
    STORE.with(|store| {
        store
            .borrow()
            .series
            .get(id)
            .map(|s| s.to_csv())
            .ok_or_else(|| JsValue::from_str(&format!("No file {id} is loaded.")))
    })
}

// -----------------------------------------------------------------------------
// Running a backtest
// -----------------------------------------------------------------------------

/// Runs the backtest over the imported files.
///
/// Returns `{ error: { kind: "invalid_request", message } }` for a request the
/// data cannot answer -- an asset whose series starts after the run, a dollar
/// asset with no USD/INR series -- because those are things for the page to
/// say, not throw.
#[wasm_bindgen]
pub fn run(request: JsValue) -> Result<JsValue, JsValue> {
    let request: RunRequest = from_js(request)?;
    STORE.with(|store| {
        let store = store.borrow();
        match portfolio::run(&request, &*store) {
            Ok(result) => to_js(&serde_json::json!(result)),
            Err(message) => to_js(&serde_json::json!({
                "error": { "kind": "invalid_request", "message": message }
            })),
        }
    })
}

/// Every market data format this build can read, so the page builds its list
/// from the module rather than from a copy that drifts.
#[wasm_bindgen]
pub fn formats() -> Result<JsValue, JsValue> {
    to_js(&serde_json::json!(xfina::formats()))
}

/// The versions actually running: this module, and the two libraries it
/// composes.
#[wasm_bindgen]
pub fn version() -> Result<JsValue, JsValue> {
    to_js(&serde_json::json!({
        "engine": env!("CARGO_PKG_VERSION"),
        "xfina": xfina::version(),
        // Until xfina-dev/xfingine#15 lands, the portfolio simulation is this
        // crate's own stand-in behind the same boundary; the page says so.
        "xfingine": option_env!("XFINGINE_VERSION").unwrap_or("0.1.1"),
        "engineApi": "shim",
    }))
}

// -----------------------------------------------------------------------------
// Plumbing
// -----------------------------------------------------------------------------

fn from_js<T: serde::de::DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
    if value.is_undefined() || value.is_null() {
        return serde_json::from_str("{}")
            .map_err(|e| JsValue::from_str(&format!("Invalid request: {e}")));
    }
    serde_wasm_bindgen::from_value(value)
        .map_err(|e| JsValue::from_str(&format!("Invalid request: {e}")))
}

fn to_js(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    // json_compatible, not the default: serde-wasm-bindgen otherwise turns
    // every map into a JS `Map`, which reads as an empty object to anything
    // expecting plain JSON.
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    value
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {e}")))
}
