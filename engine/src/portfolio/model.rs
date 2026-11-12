//! What goes into a backtest and what comes out.
//!
//! These are the shapes the Portfolio Engine's UI already agreed on: the mock's
//! `mockData.js` and `resultsData.js` are the contract, and every field here
//! answers to something the results read. JSON is `camelCase`, as it is across
//! Xfina's Rust, WASM and Python surfaces.

use serde::{Deserialize, Serialize};

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

/// One run: the assets and their weights, the money going in, the strategies to
/// try, and the reference series that turn dollars into rupees and rupees into
/// today's rupees.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub assets: Vec<AssetRequest>,
    pub plan: PlanRequest,
    pub strategies: Vec<Strategy>,
    /// `YYYY-MM-DD`, the period every picked series shares.
    pub period: Period,
    /// USD/INR, as `(date, rupees per dollar)` pairs. Required once an asset is
    /// quoted in anything but rupees.
    #[serde(default)]
    pub fx: Vec<(String, f64)>,
    /// A consumer price index, as `(date, level)` pairs, for the Real unit.
    #[serde(default)]
    pub cpi: Vec<(String, f64)>,
    /// Long-term capital gains, a percentage of the gain.
    #[serde(default = "default_ltcg")]
    pub ltcg_rate: f64,
    /// Short-term capital gains, for a lot sold inside a year.
    #[serde(default = "default_stcg")]
    pub stcg_rate: f64,
    /// The risk-free rate Sharpe and Sortino are measured over, a percentage a
    /// year. A flat assumption, like the plan's income tax: a repo-rate history
    /// is a dataset this run does not have.
    #[serde(default = "default_risk_free")]
    pub risk_free: f64,
    /// Inflation a year, a percentage, used for the Real unit when no CPI
    /// series was given.
    #[serde(default = "default_inflation")]
    pub inflation: f64,
}

fn default_ltcg() -> f64 {
    12.5
}
fn default_stcg() -> f64 {
    20.0
}
fn default_risk_free() -> f64 {
    6.5
}
fn default_inflation() -> f64 {
    6.0
}

#[derive(Debug, Clone, Deserialize)]
pub struct Period {
    pub from: String,
    pub to: String,
}

/// One allocated asset: its weight, and the files its series was read from.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRequest {
    pub name: String,
    /// What identifies this asset, region and name together (`in:Gold`). Three
    /// of the catalogue's assets share a name across regions, so a name is not
    /// an identity: see src/portfolio-engine/identity.js. Optional only so a
    /// caller that has no id still runs; everything keyed by it then falls back
    /// to the name.
    #[serde(default)]
    pub id: Option<String>,
    /// Percent of the portfolio. Weights are normalised, so a mix that totals
    /// 99 or 101 still runs.
    pub weight: f64,
    /// Handles returned by `readFile`, in any order: the pieces of one dataset.
    pub files: Vec<String>,
    /// ISO 4217. Anything but `INR` is converted with `fx`.
    #[serde(default)]
    pub currency: Option<String>,
}

/// The investment plan, field for field as `plan.js` holds it, so the page and
/// the engine cannot drift apart on what a salary curve means.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanRequest {
    #[serde(default)]
    pub lumpsum: f64,
    #[serde(default)]
    pub salary_start: f64,
    #[serde(default)]
    pub salary_by: Option<String>,
    #[serde(default)]
    pub salary_growth: f64,
    #[serde(default)]
    pub salary_end: f64,
    #[serde(default)]
    pub salary_curve: Option<String>,
    #[serde(default)]
    pub tax_rate: f64,
    #[serde(default)]
    pub rate_start: f64,
    #[serde(default)]
    pub rate_end: f64,
    #[serde(default)]
    pub rate_curve: Option<String>,
    #[serde(default)]
    pub invest_day: Option<String>,
    /// `YYYY-MM`.
    pub start_month: String,
    pub end_month: String,
}

/// A rebalancing strategy and its settings, as `store.js` records them.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "id", rename_all = "camelCase")]
pub enum Strategy {
    /// Set the weights once and never trade.
    Hold,
    #[serde(rename_all = "camelCase")]
    Calendar {
        /// `Annual` or `Half-yearly`.
        frequency: String,
        /// `January`, or `January and July` for half-yearly.
        month: String,
    },
    #[serde(rename_all = "camelCase")]
    Threshold {
        /// `Absolute` (±5 percentage points) or `Relative` (±5% of the target).
        band_type: String,
        band_all: f64,
        #[serde(default)]
        range_own: std::collections::BTreeMap<String, Band>,
    },
    #[serde(rename_all = "camelCase")]
    Perpetual {
        max_drift: f64,
        min_drift: f64,
        sell_months: f64,
        /// `Yes` to sell only lots held a year or more.
        ltcg_only: String,
    },
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Band {
    pub lo: f64,
    pub hi: f64,
}

impl Strategy {
    pub fn id(&self) -> &'static str {
        match self {
            Strategy::Hold => "hold",
            Strategy::Calendar { .. } => "calendar",
            Strategy::Threshold { .. } => "threshold",
            Strategy::Perpetual { .. } => "perpetual",
        }
    }
}

// -----------------------------------------------------------------------------
// Response
// -----------------------------------------------------------------------------

/// A run: everything shared by its strategies, then one result each.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResult {
    /// Contribution months in the run.
    pub months: usize,
    pub start_year: i32,
    pub start_month: u32,
    /// `YYYY-MM` per month index, so the page never recomputes a label.
    pub month_labels: Vec<String>,
    pub start: String,
    pub end: String,
    /// What went in each month.
    pub contribution: Vec<f64>,
    /// Running total of contributions.
    pub invested: Vec<f64>,
    /// The same, each contribution carried forward to the run's end.
    pub invested_today: Vec<f64>,
    /// A rupee of month `m` in the run's last month's rupees.
    pub to_today: Vec<f64>,
    /// Inflation a year over the run, from the CPI series where there was one.
    pub inflation: f64,
    /// Whether that came from a CPI series or from the flat assumption.
    pub inflation_from: String,
    pub risk_free: f64,
    /// Each asset, in the order the results' legend uses.
    pub assets: Vec<AssetOut>,
    pub results: Vec<StrategyResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetOut {
    pub name: String,
    /// The id the request gave, carried through so a saved run's results refer
    /// to its assets the same way the page does.
    pub id: Option<String>,
    /// The normalised target, as a fraction.
    pub target: f64,
    /// Percent, as entered.
    pub weight: f64,
    pub currency: String,
    /// Rows the stitched series had, and what it covered.
    pub rows: usize,
    pub first: String,
    pub last: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyResult {
    pub id: String,
    pub tab: String,
    pub name: String,

    pub value: Vec<f64>,
    pub r#final: f64,
    pub invested: f64,
    pub invested_today: f64,
    pub post_tax: f64,
    pub taxes_paid: f64,
    pub taxes_paid_today: f64,

    pub xirr: f64,
    pub xirr_real: f64,
    pub twr: f64,
    pub twr_real: f64,

    pub vol: f64,
    pub vol_real: f64,
    pub sharpe: f64,
    pub sharpe_real: f64,
    pub sortino: f64,
    pub sortino_real: f64,
    pub calmar: f64,
    pub calmar_real: f64,

    pub drawdown: Vec<f64>,
    pub mdd: f64,
    pub episodes: Vec<Episode>,
    pub drawdown_real: Vec<f64>,
    pub mdd_real: f64,
    pub episodes_real: Vec<Episode>,

    pub turnover: f64,
    pub trades: usize,
    /// Month indices a sale happened in.
    pub rebalances: Vec<usize>,
    /// What rebalancing sold in each month.
    pub sold: Vec<f64>,
    /// Each month's actual weights, one row per month.
    pub weights: Vec<Vec<f64>>,
    pub transactions: Vec<Txn>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub peak: usize,
    pub trough: usize,
    pub recovered: Option<usize>,
    pub depth: f64,
}

/// One transaction, as the results' table and its CSV show it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Txn {
    pub month: usize,
    /// `Contribution`, `Buy` or `Sell`.
    pub event: String,
    pub asset: String,
    /// Positive for money in or a purchase, negative for a sale.
    pub amount: f64,
    pub note: String,
}
