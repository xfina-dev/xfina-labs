//! Turning one simulated path into the figures the results show.
//!
//! Two kinds of return, kept apart because they answer different questions:
//! **XIRR** is the return on the rupees, given when each one went in, and moves
//! with the contribution plan; **CAGR** is the return on the portfolio itself,
//! chained month by month so new money cannot hide a fall. Risk is measured on
//! the second for the same reason.
//!
//! Real figures are the nominal ones deflated by the run's own inflation --
//! from its CPI series where it had one -- not a separately simulated path.

use crate::portfolio::model::{Strategy, StrategyResult};
use crate::portfolio::sim::{self, SimOut};

pub struct Context<'a> {
    pub contribution: &'a [f64],
    pub invested: &'a [f64],
    pub invested_today: &'a [f64],
    pub to_today: &'a [f64],
    pub months: usize,
    /// A fraction a year.
    pub inflation: f64,
    pub risk_free: f64,
}

pub fn describe(strategy: &Strategy, out: SimOut, ctx: &Context<'_>) -> StrategyResult {
    let last = ctx.months - 1;
    let value = out.value;
    let final_value = value[last];

    // --- The portfolio's own return, chained month by month ----------------
    // Each month's return is what the holding did, with the money that went in
    // at the start of it taken out of the numerator: the time-weighted return.
    let mut index = Vec::with_capacity(ctx.months);
    let mut returns = Vec::with_capacity(ctx.months);
    {
        let mut idx = 1.0;
        for m in 0..ctx.months {
            let opening = if m > 0 { value[m - 1] } else { 0.0 } + ctx.contribution[m];
            let r = if opening > 0.0 {
                value[m] / opening - 1.0
            } else {
                0.0
            };
            idx *= 1.0 + r;
            returns.push(r);
            index.push(idx);
        }
    }
    let years = ctx.months as f64 / 12.0;
    let twr = if years > 0.0 && index[last] > 0.0 {
        index[last].powf(1.0 / years) - 1.0
    } else {
        0.0
    };

    // --- Drawdown, nominal and real ----------------------------------------
    let drawdown = drawdown_of(&index);
    let monthly_inflation = (1.0 + ctx.inflation).powf(1.0 / 12.0);
    let real_index: Vec<f64> = index
        .iter()
        .enumerate()
        .map(|(m, x)| x / monthly_inflation.powi(m as i32 + 1))
        .collect();
    let drawdown_real = drawdown_of(&real_index);

    // --- Risk ---------------------------------------------------------------
    let vol = annual_volatility(&returns);
    let real_returns: Vec<f64> = returns
        .iter()
        .map(|r| (1.0 + r) / monthly_inflation - 1.0)
        .collect();
    let vol_real = annual_volatility(&real_returns);
    let rf_real = (1.0 + ctx.risk_free) / (1.0 + ctx.inflation) - 1.0;
    let twr_real = (1.0 + twr) / (1.0 + ctx.inflation) - 1.0;
    let sharpe = ratio(twr - ctx.risk_free, vol);
    let sharpe_real = ratio(twr_real - rf_real, vol_real);
    let sortino = ratio(
        twr - ctx.risk_free,
        downside_deviation(&returns, ctx.risk_free),
    );
    let sortino_real = ratio(
        twr_real - rf_real,
        downside_deviation(&real_returns, rf_real),
    );
    let mdd = drawdown.iter().copied().fold(0.0, f64::min);
    let mdd_real = drawdown_real.iter().copied().fold(0.0, f64::min);

    // --- What the money did -------------------------------------------------
    let x = xirr(ctx.contribution, final_value);
    // Tax paid along the way, each payment carried forward to the run's end.
    // The sales are known by month, so a payment is weighted by the month it
    // fell in rather than by a single factor over the whole run.
    let sold_total: f64 = out.sold.iter().sum();
    let taxes_paid_today = if sold_total > 0.0 {
        out.sold
            .iter()
            .enumerate()
            .map(|(m, s)| out.taxes_paid * (s / sold_total) * ctx.to_today[m])
            .sum()
    } else {
        0.0
    };

    StrategyResult {
        id: strategy.id().into(),
        tab: tab_of(strategy).into(),
        name: name_of(strategy),
        value,
        r#final: final_value,
        invested: ctx.invested[last],
        invested_today: ctx.invested_today[last],
        post_tax: final_value - out.exit_tax,
        taxes_paid: out.taxes_paid,
        taxes_paid_today,
        xirr: x,
        xirr_real: (1.0 + x) / (1.0 + ctx.inflation) - 1.0,
        twr,
        twr_real,
        vol,
        vol_real,
        sharpe,
        sharpe_real,
        sortino,
        sortino_real,
        calmar: ratio(twr, mdd.abs()),
        calmar_real: ratio(twr_real, mdd_real.abs()),
        episodes: sim::episodes(&drawdown),
        episodes_real: sim::episodes(&drawdown_real),
        drawdown,
        mdd,
        drawdown_real,
        mdd_real,
        turnover: out.turnover,
        trades: out.trades,
        rebalances: out.rebalances,
        sold: out.sold,
        weights: out.weights,
        transactions: out.transactions,
    }
}

fn drawdown_of(index: &[f64]) -> Vec<f64> {
    let mut peak = 1.0_f64;
    index
        .iter()
        .map(|x| {
            peak = peak.max(*x);
            x / peak - 1.0
        })
        .collect()
}

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator > 1e-12 {
        numerator / denominator
    } else {
        0.0
    }
}

/// The standard deviation of monthly returns, scaled to a year.
fn annual_volatility(returns: &[f64]) -> f64 {
    if returns.len() < 2 {
        return 0.0;
    }
    let mean = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>()
        / (returns.len() - 1) as f64;
    variance.sqrt() * 12.0_f64.sqrt()
}

/// Downside deviation: only months below the risk-free rate count as risk.
fn downside_deviation(returns: &[f64], annual_risk_free: f64) -> f64 {
    if returns.is_empty() {
        return 0.0;
    }
    let monthly_rf = (1.0 + annual_risk_free).powf(1.0 / 12.0) - 1.0;
    let sum: f64 = returns
        .iter()
        .map(|r| (r - monthly_rf).min(0.0).powi(2))
        .sum();
    (sum / returns.len() as f64).sqrt() * 12.0_f64.sqrt()
}

/// The internal rate of return on the monthly contributions against the final
/// value, by Newton's method on a monthly rate, annualised.
fn xirr(contribution: &[f64], final_value: f64) -> f64 {
    let n = contribution.len();
    if n == 0 || final_value <= 0.0 || contribution.iter().sum::<f64>() <= 0.0 {
        return 0.0;
    }
    let mut i = 0.01_f64;
    for _ in 0..200 {
        let mut f = -final_value;
        let mut d = 0.0;
        for (m, c) in contribution.iter().enumerate() {
            let periods = (n - m) as f64;
            f += c * (1.0 + i).powf(periods);
            d += periods * c * (1.0 + i).powf(periods - 1.0);
        }
        if d.abs() < 1e-12 {
            break;
        }
        let step = f / d;
        i -= step;
        // A loss deep enough to take the rate below -100% a month has no
        // meaning; hold it just above and let the iteration settle.
        if i <= -0.999 {
            i = -0.999;
        }
        if step.abs() < 1e-12 {
            break;
        }
    }
    (1.0 + i).powi(12) - 1.0
}

fn tab_of(strategy: &Strategy) -> &'static str {
    match strategy {
        Strategy::Hold => "Buy & hold",
        Strategy::Calendar { .. } => "Calendar",
        Strategy::Threshold { .. } => "Threshold",
        Strategy::Perpetual { .. } => "Perpetual",
    }
}

/// The strategy and its settings in a few words, as the page labels a run.
fn name_of(strategy: &Strategy) -> String {
    match strategy {
        Strategy::Hold => "No rebalancing (buy and hold)".into(),
        Strategy::Calendar { frequency, month } => {
            format!("Calendar rebalance · {frequency}, {month}")
        }
        Strategy::Threshold {
            band_type,
            band_all,
            range_own,
        } => format!(
            "Threshold rebalance · {band_type} ±{band_all}%{}",
            if range_own.is_empty() {
                ""
            } else {
                ", own ranges"
            }
        ),
        Strategy::Perpetual {
            max_drift,
            min_drift,
            ..
        } => format!("Perpetual rebalance · {max_drift}% → {min_drift}%"),
    }
}
