//! The simulation: units bought and sold month by month, with the lots kept so
//! a sale's tax is the tax on that sale.
//!
//! Everything here is arithmetic over numbers already parsed -- no file
//! reading, no clock, no network -- which is why it is the half that belongs in
//! `xfingine` and will move there (see `mod.rs`).

use crate::portfolio::model::{Band, Episode, Strategy, Txn};

/// A purchase, kept until its units are sold: FIFO, and with the month it was
/// bought in so a sale knows whether the gain is long or short term.
#[derive(Debug, Clone, Copy)]
struct Lot {
    month: usize,
    units: f64,
    cost: f64,
}

/// What one strategy did, in the units the results read.
pub struct SimOut {
    pub value: Vec<f64>,
    pub weights: Vec<Vec<f64>>,
    pub sold: Vec<f64>,
    pub taxes_paid: f64,
    pub trades: usize,
    pub rebalances: Vec<usize>,
    pub transactions: Vec<Txn>,
    /// Tax that would fall due if everything left were sold in the last month.
    pub exit_tax: f64,
    pub turnover: f64,
}

pub struct SimInput<'a> {
    /// Per asset: the price its units are bought at each month.
    pub buy: &'a [Vec<f64>],
    /// Per asset: the price the holding is marked at each month's end.
    pub mark: &'a [Vec<f64>],
    pub names: &'a [String],
    /// What identifies each asset, in the same order (`in:Gold`).
    pub ids: &'a [String],
    pub targets: &'a [f64],
    pub contribution: &'a [f64],
    pub months: usize,
    pub start_month_of_year: u32,
    pub ltcg_rate: f64,
    pub stcg_rate: f64,
}

/// Runs one strategy over the whole period.
// `m` indexes the price grids, the contributions and the output alike; iterating
// any one of them would only hide the others.
#[allow(clippy::needless_range_loop)]
pub fn simulate(input: &SimInput<'_>, strategy: &Strategy) -> SimOut {
    let n = input.targets.len();
    let mut lots: Vec<Vec<Lot>> = vec![Vec::new(); n];
    let mut units = vec![0.0; n];

    let mut value = Vec::with_capacity(input.months);
    let mut weights = Vec::with_capacity(input.months);
    let mut sold_by_month = vec![0.0; input.months];
    let mut transactions = Vec::new();
    let mut taxes_paid = 0.0;
    let mut trades = 0usize;
    let mut rebalances = Vec::new();
    let mut total_sold = 0.0;
    let mut value_sum = 0.0;

    // Perpetual's selling runs over several months once it starts: this is how
    // much of the excess drift is still to be worked off, and over how long.
    let mut perpetual_left = 0usize;

    for m in 0..input.months {
        // --- Money in -------------------------------------------------------
        let cash = input.contribution[m];
        if cash > 0.0 {
            transactions.push(Txn {
                month: m,
                event: "Contribution".into(),
                asset: "—".into(),
                amount: cash,
                note: if m == 0 {
                    "lumpsum and first month".into()
                } else {
                    "monthly".into()
                },
            });
        }

        // What the holding is worth at the investment day's prices, which is
        // what decides where new money goes.
        let at_buy: Vec<f64> = (0..n).map(|k| units[k] * input.buy[k][m]).collect();
        let held: f64 = at_buy.iter().sum();

        let buys = allocate(strategy, &at_buy, held, cash, input.targets);
        for (k, amount) in buys.iter().enumerate() {
            if *amount <= 0.0 {
                continue;
            }
            let price = input.buy[k][m];
            let u = amount / price;
            units[k] += u;
            lots[k].push(Lot {
                month: m,
                units: u,
                cost: price,
            });
            transactions.push(Txn {
                month: m,
                event: "Buy".into(),
                asset: input.names[k].clone(),
                amount: *amount,
                note: buy_note(strategy, input.targets[k]),
            });
        }

        // --- Rebalancing ----------------------------------------------------
        // Judged on the investment day's prices too, so a month's decision uses
        // one set of prices throughout.
        let after: Vec<f64> = (0..n).map(|k| units[k] * input.buy[k][m]).collect();
        let total: f64 = after.iter().sum();
        if total > 0.0 {
            let plan = rebalance_plan(
                strategy,
                m,
                &after,
                total,
                input.targets,
                input.ids,
                input.start_month_of_year,
                &mut perpetual_left,
            );
            if let Some(plan) = plan {
                let (proceeds, tax) = sell(
                    &plan.sell,
                    m,
                    input,
                    &mut units,
                    &mut lots,
                    &mut transactions,
                    &plan.note,
                    strategy,
                );
                if proceeds > 0.0 {
                    trades += plan.sell.iter().filter(|x| **x > 0.0).count();
                    rebalances.push(m);
                    sold_by_month[m] = proceeds;
                    total_sold += proceeds;
                    taxes_paid += tax;
                    // The tax comes out of the proceeds; what is left is put
                    // back to work in the underweights.
                    let reinvest = (proceeds - tax).max(0.0);
                    let into = plan.buy_shares(&after, total, input.targets);
                    let share_total: f64 = into.iter().sum();
                    if share_total > 0.0 {
                        for (k, share) in into.iter().enumerate() {
                            let amount = reinvest * share / share_total;
                            if amount <= 0.0 {
                                continue;
                            }
                            let price = input.buy[k][m];
                            let u = amount / price;
                            units[k] += u;
                            lots[k].push(Lot {
                                month: m,
                                units: u,
                                cost: price,
                            });
                            transactions.push(Txn {
                                month: m,
                                event: "Buy".into(),
                                asset: input.names[k].clone(),
                                amount,
                                note: "to target".into(),
                            });
                        }
                    }
                }
            }
        }

        // --- The month's end ------------------------------------------------
        let marked: Vec<f64> = (0..n).map(|k| units[k] * input.mark[k][m]).collect();
        let v: f64 = marked.iter().sum();
        value.push(v);
        value_sum += v;
        weights.push(
            marked
                .iter()
                .map(|x| if v > 0.0 { x / v } else { 0.0 })
                .collect(),
        );
    }

    // What selling the lot of it at the end would cost.
    let last = input.months.saturating_sub(1);
    let mut exit_tax = 0.0;
    for (k, held) in lots.iter().enumerate() {
        let price = input.mark[k].get(last).copied().unwrap_or(0.0);
        for lot in held {
            let gain = (price - lot.cost) * lot.units;
            if gain > 0.0 {
                exit_tax += gain * rate_for(last - lot.month, input) / 100.0;
            }
        }
    }

    // Turnover: what was sold over the run against the portfolio's average
    // value, as a share a year.
    let years = input.months as f64 / 12.0;
    let average = if input.months > 0 {
        value_sum / input.months as f64
    } else {
        0.0
    };
    let turnover = if average > 0.0 && years > 0.0 {
        total_sold / average / years
    } else {
        0.0
    };

    SimOut {
        value,
        weights,
        sold: sold_by_month,
        taxes_paid,
        trades,
        rebalances,
        transactions,
        exit_tax,
        turnover,
    }
}

fn rate_for(months_held: usize, input: &SimInput<'_>) -> f64 {
    if months_held >= 12 {
        input.ltcg_rate
    } else {
        input.stcg_rate
    }
}

fn buy_note(strategy: &Strategy, target: f64) -> String {
    match strategy {
        Strategy::Perpetual { .. } => "to underweights".into(),
        _ => format!("{:.0}% target", target * 100.0),
    }
}

/// Where a month's new money goes.
///
/// Every strategy but Perpetual buys by target weight. Perpetual fills the
/// underweights first -- water-filling -- which is the whole point of it: new
/// money does the rebalancing, so nothing has to be sold and no tax falls due.
fn allocate(
    strategy: &Strategy,
    held: &[f64],
    total_held: f64,
    cash: f64,
    targets: &[f64],
) -> Vec<f64> {
    let n = targets.len();
    if cash <= 0.0 || n == 0 {
        return vec![0.0; n];
    }
    if !matches!(strategy, Strategy::Perpetual { .. }) {
        return targets.iter().map(|t| cash * t).collect();
    }
    // After the money goes in the portfolio is worth this much; buy each asset
    // up to its share of that, as far as the cash goes.
    let after = total_held + cash;
    let want: Vec<f64> = (0..n)
        .map(|k| (targets[k] * after - held[k]).max(0.0))
        .collect();
    let wanted: f64 = want.iter().sum();
    if wanted <= 0.0 {
        return targets.iter().map(|t| cash * t).collect();
    }
    if wanted <= cash {
        // Every underweight filled, and what is left over spread by target.
        let spare = cash - wanted;
        return (0..n).map(|k| want[k] + spare * targets[k]).collect();
    }
    want.iter().map(|w| cash * w / wanted).collect()
}

struct RebalancePlan {
    /// Rupees to sell of each asset.
    sell: Vec<f64>,
    note: String,
    /// `true` when the proceeds go back to the full targets, `false` when they
    /// only fill the underweights (Perpetual, stepping drift down).
    to_target: bool,
}

impl RebalancePlan {
    /// How the proceeds are split across the assets being bought.
    fn buy_shares(&self, held: &[f64], total: f64, targets: &[f64]) -> Vec<f64> {
        let n = targets.len();
        if self.to_target {
            // Everything that is under its target, by how far under it is.
            return (0..n)
                .map(|k| (targets[k] * total - held[k]).max(0.0))
                .collect();
        }
        (0..n)
            .map(|k| {
                if self.sell[k] > 0.0 {
                    0.0
                } else {
                    (targets[k] * total - held[k]).max(0.0)
                }
            })
            .collect()
    }
}

fn rebalance_plan(
    strategy: &Strategy,
    m: usize,
    held: &[f64],
    total: f64,
    targets: &[f64],
    ids: &[String],
    start_month_of_year: u32,
    perpetual_left: &mut usize,
) -> Option<RebalancePlan> {
    let n = targets.len();
    let over = |k: usize| (held[k] - targets[k] * total).max(0.0);
    match strategy {
        Strategy::Hold => None,
        Strategy::Calendar { frequency, month } => {
            let calendar_month = ((start_month_of_year as usize - 1 + m) % 12) + 1;
            let wanted = calendar_months(frequency, month);
            // Not in the run's first month: the portfolio was just bought at
            // its targets, so there is nothing to restore.
            if m == 0 || !wanted.contains(&(calendar_month as u32)) {
                return None;
            }
            let sell: Vec<f64> = (0..n).map(over).collect();
            if sell.iter().sum::<f64>() <= 0.0 {
                return None;
            }
            Some(RebalancePlan {
                sell,
                note: "scheduled rebalance".into(),
                to_target: true,
            })
        }
        Strategy::Threshold {
            band_type,
            band_all,
            range_own,
        } => {
            // Each asset against its own band: absolute bands are percentage
            // points around the target, relative ones a share of it.
            let outside: Vec<usize> = (0..n)
                .filter(|&k| {
                    let w = if total > 0.0 { held[k] / total } else { 0.0 };
                    let (lo, hi) = band_for(&ids[k], targets[k], band_type, *band_all, range_own);
                    w < lo || w > hi
                })
                .collect();
            if outside.is_empty() {
                return None;
            }
            let sell: Vec<f64> = (0..n).map(over).collect();
            if sell.iter().sum::<f64>() <= 0.0 {
                return None;
            }
            Some(RebalancePlan {
                sell,
                note: "outside its range".into(),
                to_target: true,
            })
        }
        Strategy::Perpetual {
            max_drift,
            min_drift,
            sell_months,
            ..
        } => {
            // Total drift: the sum of the overweights, which equals the sum of
            // the underweights. Selling starts above the limit and steps the
            // drift down to the floor over the given months.
            let drift: f64 = (0..n).map(over).sum::<f64>() / total;
            let max = max_drift / 100.0;
            let min = min_drift / 100.0;
            if drift > max {
                *perpetual_left = (*sell_months).max(1.0) as usize;
            }
            if *perpetual_left == 0 || drift <= min {
                *perpetual_left = 0;
                return None;
            }
            // This month's step: a share of the way from here to the floor.
            let steps = *perpetual_left as f64;
            let excess = ((drift - min) / steps).max(0.0);
            *perpetual_left -= 1;
            let to_sell = excess * total;
            let over_total: f64 = (0..n).map(over).sum();
            if over_total <= 0.0 || to_sell <= 0.0 {
                return None;
            }
            let sell: Vec<f64> = (0..n)
                .map(|k| to_sell * over(k) / over_total)
                .collect();
            Some(RebalancePlan {
                sell,
                note: "portfolio drift above the limit".into(),
                to_target: false,
            })
        }
    }
}

fn band_for(
    id: &str,
    target: f64,
    band_type: &str,
    band_all: f64,
    range_own: &std::collections::BTreeMap<String, Band>,
) -> (f64, f64) {
    // An own range belongs to the asset it was set on, and is looked up by that
    // asset's id. It used to be taken by position in this map, and only when
    // exactly one range was set: a second one made both fall back to the shared
    // band, and the one worked on whichever asset happened to sort first.
    if let Some(band) = range_own.get(id) {
        return (band.lo / 100.0, band.hi / 100.0);
    }
    if band_type == "Relative" {
        let w = band_all / 100.0;
        (target * (1.0 - w), target * (1.0 + w))
    } else {
        let w = band_all / 100.0;
        ((target - w).max(0.0), target + w)
    }
}

fn calendar_months(frequency: &str, month: &str) -> Vec<u32> {
    const NAMES: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let index = |name: &str| NAMES.iter().position(|n| *n == name).map(|i| i as u32 + 1);
    // Half-yearly is written "January and July": both months count.
    let mut out: Vec<u32> = month
        .split(" and ")
        .filter_map(|part| index(part.trim()))
        .collect();
    if out.is_empty() {
        out.push(1);
    }
    if frequency == "Half-yearly" && out.len() == 1 {
        out.push((out[0] + 5) % 12 + 1);
    }
    out
}

/// Sells the planned rupees of each asset, oldest lots first, and reports the
/// tax on the gains it realised.
#[allow(clippy::too_many_arguments)]
fn sell(
    plan: &[f64],
    m: usize,
    input: &SimInput<'_>,
    units: &mut [f64],
    lots: &mut [Vec<Lot>],
    transactions: &mut Vec<Txn>,
    note: &str,
    strategy: &Strategy,
) -> (f64, f64) {
    let ltcg_only = matches!(
        strategy,
        Strategy::Perpetual { ltcg_only, .. } if ltcg_only == "Yes"
    );
    let mut proceeds = 0.0;
    let mut tax = 0.0;
    for (k, amount) in plan.iter().enumerate() {
        if *amount <= 0.0 {
            continue;
        }
        let price = input.buy[k][m];
        let mut to_sell = (amount / price).min(units[k]);
        if to_sell <= 0.0 {
            continue;
        }
        let mut raised = 0.0;
        let mut index = 0;
        while to_sell > 1e-12 && index < lots[k].len() {
            let lot = lots[k][index];
            // With "sell LTCG lots only" on, a lot younger than a year is left
            // alone: the point of the setting is to not pay short-term rates.
            if ltcg_only && m - lot.month < 12 {
                index += 1;
                continue;
            }
            let take = to_sell.min(lot.units);
            let gain = (price - lot.cost) * take;
            if gain > 0.0 {
                tax += gain * rate_for(m - lot.month, input) / 100.0;
            }
            raised += take * price;
            to_sell -= take;
            units[k] -= take;
            if (lot.units - take).abs() < 1e-12 {
                lots[k].remove(index);
            } else {
                lots[k][index].units -= take;
                index += 1;
            }
        }
        if raised > 0.0 {
            proceeds += raised;
            transactions.push(Txn {
                month: m,
                event: "Sell".into(),
                asset: input.names[k].clone(),
                amount: -raised,
                note: match strategy {
                    Strategy::Threshold { .. } => {
                        format!("{} {}", input.names[k], note)
                    }
                    _ => note.to_string(),
                },
            });
        }
    }
    (proceeds, tax)
}

/// The three deepest drawdowns: peak, trough and recovery, with the depth.
///
/// A port of the mock's own `episodes`, so the table reads the same.
pub fn episodes(dd: &[f64]) -> Vec<Episode> {
    let mut out: Vec<Episode> = Vec::new();
    let mut peak = 0usize;
    for m in 1..=dd.len() {
        if m < dd.len() && dd[m] < 0.0 {
            continue;
        }
        if m.saturating_sub(1) > peak {
            let mut trough = peak + 1;
            for k in (peak + 1)..m {
                if dd[k] < dd[trough] {
                    trough = k;
                }
            }
            out.push(Episode {
                peak,
                trough,
                recovered: (m < dd.len()).then_some(m),
                depth: dd[trough],
            });
        }
        peak = m;
    }
    out.sort_by(|a, b| a.depth.partial_cmp(&b.depth).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(3);
    out
}
