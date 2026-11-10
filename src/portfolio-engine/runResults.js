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
export function weightRows(run, res, step) {
  if (step === 'Monthly') return res.weights.map((w, m) => ({ label: monthOf(run, m), w }));
  return yearEnds(run).map((m) => ({ label: String(yearOf(run, m)), w: res.weights[m] }));
}
