// What the results read: one run's figures, shaped for the tables, the charts
// and the exports.
//
// Every number here comes from the engine (engine/src/portfolio): the value
// path, the drawdowns, the weights month by month, each transaction, and the
// inflation the Real unit uses -- from the run's own CPI series where it had
// one. This module only groups them by month or by year and formats them.
// It replaces mockData.js and resultsData.js, which made their numbers up.

// --- Formatting -------------------------------------------------------------
export const inr = (x) => (Math.abs(x) >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : `₹${(x / 1e5).toFixed(2)} L`);
export const pct = (x, d = 1) => `${x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(d)}%`;

// The month's label, e.g. 2008-10. The engine already wrote them all, so a run
// and its exports can never disagree about which month a row is.
export const monthOf = (run, m) => run.monthLabels[m] ?? '';
export const yearOf = (run, m) => Number((run.monthLabels[m] ?? '').slice(0, 4));

// A rupee of month m in the run's last month's rupees.
export const toToday = (run, m) => run.toToday[m] ?? 1;

// A result's value line in the chosen unit.
export const valueIn = (run, r, today) => (today ? r.value.map((v, m) => v * toToday(run, m)) : r.value);
export const investedLine = (run, today) => (today ? run.investedToday : run.invested);

// The months a year ends on, and the run's last month when it falls mid-year.
export function yearEnds(run) {
  const out = [];
  for (let m = 0; m < run.months; m++) if (m === run.months - 1 || yearOf(run, m) !== yearOf(run, m + 1)) out.push(m);
  return out;
}

// --- Rows -------------------------------------------------------------------
// Year-end rows for the 'By year' chart and the table: invested so far, value,
// growth, and what went in and what rebalancing sold over the year.
export function yearly(run, res, today) {
  const ends = yearEnds(run);
  let from = 0;
  return ends.map((m) => {
    const months = Array.from({ length: m - from + 1 }, (_, k) => from + k);
    from = m + 1;
    const f = (i) => (today ? toToday(run, i) : 1);
    const inv = today ? run.investedToday[m] : run.invested[m];
    const val = res.value[m] * (today ? toToday(run, m) : 1);
    return {
      year: yearOf(run, m), invested: inv, value: val, growth: val - inv,
      contribution: months.reduce((n, i) => n + run.contribution[i] * f(i), 0),
      sold: months.reduce((n, i) => n + res.sold[i] * f(i), 0),
    };
  });
}

// Monthly rows for the detail's table: invested so far and value, in either unit.
export function monthly(run, res, today) {
  return res.value.map((v, m) => {
    const f = today ? toToday(run, m) : 1;
    return {
      month: monthOf(run, m), contribution: run.contribution[m] * f, sold: res.sold[m] * f,
      invested: today ? run.investedToday[m] : run.invested[m], value: v * f, growth: v * f - (today ? run.investedToday[m] : run.invested[m]),
    };
  });
}

// Every transaction the run made, as the table and the CSV show them.
export function transactions(run, res, today) {
  return res.transactions.map((t) => ({
    month: monthOf(run, t.month),
    event: t.event,
    asset: t.asset,
    amount: t.amount * (today ? toToday(run, t.month) : 1),
    note: t.note,
  }));
}

// Purchases and rebalancing sales summed by month or by year and asset, for the
// transactions chart and table. Colours come from the allocation, so the chart
// and the legend agree.
export function tradesBy(run, res, assets, today, byYear) {
  const out = new Map();
  const blank = () => assets.map((a) => ({ name: a.name, color: a.color, bought: 0, sold: 0 }));
  for (const t of res.transactions) {
    if (t.event === 'Contribution') continue;
    const label = byYear ? String(yearOf(run, t.month)) : monthOf(run, t.month);
    if (!out.has(label)) out.set(label, { label, assets: blank() });
    const row = out.get(label).assets.find((a) => a.name === t.asset);
    if (!row) continue;
    const amount = t.amount * (today ? toToday(run, t.month) : 1);
    if (amount > 0) row.bought += amount; else row.sold -= amount;
  }
  return [...out.values()];
}

// Each month's actual weights, or each year's end, for the allocation and drift
// charts. The engine returns one row per month; this picks the rows shown.
//
// A month before the first rupee goes in holds nothing, so the engine returns a
// row of zeros for it -- truthfully, but there is no allocation there to show,
// and a zero row read as an allocation says every asset is 100% of its target
// below target. Those leading months are left out, so the series starts at the
// first month the portfolio actually held something. The rows that remain are
// still consecutive, which is what the charts' month arithmetic needs; the
// first row's label gives them the year to count from.
export function weightRows(run, res, step) {
  const held = (m) => res.value[m] > 0;
  const rows = step === 'Monthly'
    ? res.weights.map((w, m) => ({ label: monthOf(run, m), month: m, w }))
    : yearEnds(run).map((m) => ({ label: String(yearOf(run, m)), month: m, w: res.weights[m] }));
  const first = rows.findIndex((r) => held(r.month));
  // Nothing was ever held: there is no allocation to show at all.
  if (first < 0) return [];
  return first === 0 ? rows : rows.slice(first);
}

// The year the rows start in, for the charts' x axis: a year label or a
// 'YYYY-MM' month both begin with it.
export const startYearOf = (rows, fallback) => (rows.length ? Number(rows[0].label.slice(0, 4)) : fallback);

// Drift: each asset's weight less its target (positive when overweight), and
// the total drift, which is half the sum of the absolute drifts.
//
// For any row whose weights total 100% -- which is every row the portfolio
// holds something in -- the half-sum is exactly the sum of the overweights,
// equal to the sum of the underweights, and that is what Perpetual sells on
// (Threshold goes asset by asset). It is written as the half-sum rather than as
// the overweights so the figure does not depend on that invariant holding: a
// row of weights that do not total 100% -- a portfolio holding nothing, say --
// is far from its targets, and must not read as 0% drift, which would make the
// one row with no allocation at all look like the best-behaved row in the
// table.
export function driftRows(rows, targets) {
  return rows.map((r) => {
    const drift = r.w.map((w, k) => w - (targets[k] ?? 0));
    return { label: r.label, month: r.month, drift, total: drift.reduce((a, d) => a + Math.abs(d), 0) / 2 };
  });
}
