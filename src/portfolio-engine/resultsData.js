// Illustrative backtest output for the design mock: the default picks (run 2007-01-05 → 2026-09-21), the
// default investment plan (plan.js: ₹10 L lumpsum, then 30% → 50% of take-home, from a ₹1.25 L salary growing
// 10% a year, taxed 20%) and
// 6% inflation. The return path is
// made up; the arithmetic on it (invested, today's rupees, XIRR, tax) is real. None of it is a real backtest.

import { DEFAULT_PLAN, planRows, contributionAt } from './plan.js';

export const START = '2007-01-05';
export const END = '2026-09-21';
export const MONTHS = 237; // January 2007 to September 2026
export const START_YEAR = 2007;
const INFLATION = 0.06;
const TAX = 0.125; // long-term capital gains, on gains realised by a sale or at the end

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Money in each month: the lumpsum with the first instalment, then each year's share of salary.
const PLAN_ROWS = planRows(DEFAULT_PLAN);
export const contribution = (m) => contributionAt(DEFAULT_PLAN, m, PLAN_ROWS);
// A rupee in month m, in today's (the run's last month's) rupees.
export const toToday = (m) => (1 + INFLATION) ** ((MONTHS - 1 - m) / 12);

// One made-up monthly return path, with 2008 and March 2020 in it.
const r = rng(11);
const returns = Array.from({ length: MONTHS }, (_, m) => {
  const crash = m >= 14 && m <= 25 ? -0.035 : m === 158 ? -0.16 : m === 159 ? -0.05 : 0;
  return 0.0105 + (r() - 0.5) * 0.05 + crash;
});
const base = [], invested = [], investedToday = [];
{
  let v = 0, inv = 0, invT = 0;
  for (let m = 0; m < MONTHS; m++) {
    const c = contribution(m);
    v = (v + c) * (1 + returns[m]);
    inv += c; invT += c * toToday(m);
    base.push(v); invested.push(inv); investedToday.push(invT);
  }
}
export { invested, investedToday };

// XIRR of monthly contributions against a final value, by Newton's method on a monthly rate.
function xirr(final) {
  let i = 0.01;
  for (let k = 0; k < 60; k++) {
    let f = -final, d = 0;
    for (let m = 0; m < MONTHS; m++) { const n = MONTHS - m; f += contribution(m) * (1 + i) ** n; d += n * contribution(m) * (1 + i) ** (n - 1); }
    i -= f / d;
  }
  return (1 + i) ** 12 - 1;
}

const STRATEGIES = [
  { id: 'hold', tab: 'Buy & hold', name: 'No rebalancing (buy and hold)', final: 9.31e7, taxesPaid: 0, vol: 0.152, sharpe: 0.79, turnover: 0, trades: 0, rebalances: [] },
  { id: 'calendar', tab: 'Calendar', name: 'Calendar rebalance · Annual, January', final: 9.02e7, taxesPaid: 2.1e6, vol: 0.131, sharpe: 0.83, turnover: 0.214, trades: 68, rebalances: Array.from({ length: 19 }, (_, y) => 12 * (y + 1)) },
  { id: 'threshold', tab: 'Threshold', name: 'Threshold rebalance · ±5%', final: 9.12e7, taxesPaid: 1.6e6, vol: 0.136, sharpe: 0.82, turnover: 0.183, trades: 41, rebalances: [21, 27, 61, 96, 131, 160, 183, 216] },
  { id: 'perpetual', tab: 'Perpetual', name: 'Perpetual rebalance · 10% → 5%', final: 9.24e7, taxesPaid: 4e5, vol: 0.134, sharpe: 0.84, turnover: 0.061, trades: 12, rebalances: [161, 162, 163, 201] },
];

// Each strategy's value path: the made-up path with its growth scaled so it ends at the strategy's value.
export const results = STRATEGIES.map((s) => {
  const end = MONTHS - 1;
  const g = (s.final - invested[end]) / (base[end] - invested[end]);
  const value = base.map((v, m) => invested[m] + (v - invested[m]) * g);
  // Drawdown and CAGR come from the return index (time-weighted), so new money doesn't hide a fall.
  let idx = 1, peak = 1;
  const index = value.map((v, m) => (idx *= v / ((m ? value[m - 1] : 0) + contribution(m))));
  const drawdown = index.map((x) => { peak = Math.max(peak, x); return x / peak - 1; });
  const twr = index.at(-1) ** (12 / MONTHS) - 1;
  // The same index in real terms: each month's return deflated by that month's inflation.
  const monthlyInflation = (1 + INFLATION) ** (1 / 12);
  let realPeak = 1;
  const drawdownReal = index.map((x, m) => { const y = x / monthlyInflation ** (m + 1); realPeak = Math.max(realPeak, y); return y / realPeak - 1; });
  const realised = s.taxesPaid / TAX; // gains already taxed by rebalancing sales
  const exitTax = TAX * Math.max(0, s.final - invested[end] - realised);
  const x = xirr(s.final);
  return {
    ...s, twr, value, drawdown, mdd: Math.min(...drawdown), episodes: episodes(drawdown),
    drawdownReal, mddReal: Math.min(...drawdownReal), episodesReal: episodes(drawdownReal),
    invested: invested[end], investedToday: investedToday[end],
    taxesPaidToday: s.taxesPaid * 1.3,
    postTax: s.final - exitTax,
    xirr: x, xirrReal: (1 + x) / (1 + INFLATION) - 1,
    twrReal: (1 + twr) / (1 + INFLATION) - 1,
    // Sortino: return above the risk-free rate ÷ downside deviation (a placeholder here, like vol and Sharpe).
    // Calmar: CAGR ÷ |max drawdown| over the whole run, in either unit.
    sortino: Math.round(s.sharpe * 1.42 * 100) / 100,
    // Real Sharpe and Sortino deflate the portfolio and the repo rate alike, so they sit just below nominal
    // (placeholders; the engine computes them from the real return series).
    sharpeReal: Math.round(s.sharpe * 0.97 * 100) / 100,
    sortinoReal: Math.round(s.sharpe * 1.42 * 0.96 * 100) / 100,
    calmar: twr / Math.abs(Math.min(...drawdown)),
    calmarReal: ((1 + twr) / (1 + INFLATION) - 1) / Math.abs(Math.min(...drawdownReal)),
  };
});

// The month's label, e.g. 2008-10.
export const monthOf = (m) => `${START_YEAR + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;

// The three deepest drawdowns: peak, trough and recovery months, depth, and months to the trough and back.
function episodes(dd) {
  const out = [];
  let peak = 0;
  for (let m = 1; m <= dd.length; m++) {
    if (m < dd.length && dd[m] < 0) continue;
    if (m - 1 > peak) {
      let trough = peak + 1;
      for (let k = peak + 1; k < m; k++) if (dd[k] < dd[trough]) trough = k;
      out.push({ peak, trough, recovered: m < dd.length ? m : null, depth: dd[trough] });
    }
    peak = m;
  }
  return out.sort((a, b) => a.depth - b.depth).slice(0, 3);
}

// What rebalancing sold in month m (made up: a slice of the portfolio in the strategy's rebalance months).
const soldIn = (res, m) => (res.rebalances.includes(m) ? res.value[m] * 0.035 : 0);

// Year-end rows for the 'By year' chart and the table: invested so far, value, growth, in either unit.
export function yearly(res, today) {
  const out = [];
  for (let m = 11; m < MONTHS; m += 12) out.push(m);
  if (out.at(-1) !== MONTHS - 1) out.push(MONTHS - 1);
  return out.map((m) => {
    const inv = today ? investedToday[m] : invested[m];
    const val = today ? res.value[m] * toToday(m) : res.value[m];
    const from = Math.floor(m / 12) * 12, months = Array.from({ length: m - from + 1 }, (_, k) => from + k);
    return {
      year: START_YEAR + Math.floor(m / 12), invested: inv, value: val, growth: val - inv,
      contribution: months.reduce((n, i) => n + (today ? contribution(i) * toToday(i) : contribution(i)), 0),
      sold: months.reduce((n, i) => n + (today ? soldIn(res, i) * toToday(i) : soldIn(res, i)), 0),
    };
  });
}

// Monthly rows for the detail's table: invested so far and value, in either unit.
export function monthly(res, today) {
  return res.value.map((v, m) => {
    const inv = today ? investedToday[m] : invested[m];
    const val = today ? v * toToday(m) : v;
    const f = today ? toToday(m) : 1;
    return { month: monthOf(m), contribution: contribution(m) * f, sold: soldIn(res, m) * f, invested: inv, value: val, growth: val - inv };
  });
}

// Every transaction (illustrative): each month's contribution bought by target weight, and in a rebalance
// month the overweight asset sold and the proceeds bought into the rest by target weight.
export function transactions(res, assets, today) {
  const rows = [];
  const total = assets.reduce((n, a) => n + Number(a.weight || 0), 0) || 1;
  for (let m = 0; m < MONTHS; m++) {
    const f = today ? toToday(m) : 1, c = contribution(m) * f;
    rows.push({ month: monthOf(m), event: 'Contribution', asset: '—', amount: c, note: m === 0 ? 'lumpsum and first month' : 'monthly' });
    // Perpetual steers new money to the underweight assets (water-filling); the mock still splits it by weight.
    const buyNote = (a) => (res.id === 'perpetual' ? 'to underweights' : `${a.weight}% target`);
    for (const a of assets) rows.push({ month: monthOf(m), event: 'Buy', asset: a.name, amount: (c * a.weight) / total, note: buyNote(a) });
    const sold = soldIn(res, m) * f;
    if (sold) {
      const over = assets.reduce((x, a) => (Number(a.weight) > Number(x.weight) ? a : x), assets[0]);
      const note = { calendar: 'scheduled rebalance', threshold: `${over.name} outside its range`, perpetual: 'portfolio drift above the limit' }[res.id];
      rows.push({ month: monthOf(m), event: 'Sell', asset: over.name, amount: -sold, note });
      const rest = assets.filter((a) => a !== over), restWeight = rest.reduce((n, a) => n + Number(a.weight || 0), 0) || 1;
      for (const a of rest) rows.push({ month: monthOf(m), event: 'Buy', asset: a.name, amount: (sold * a.weight) / restWeight, note: 'to target' });
    }
  }
  return rows;
}

// Purchases and rebalancing sales summed by month or by year and asset, for the transactions chart and table.
export function tradesBy(res, assets, today, byYear) {
  const out = new Map();
  for (const t of transactions(res, assets, today)) {
    if (t.event === 'Contribution') continue;
    const label = byYear ? t.month.slice(0, 4) : t.month;
    if (!out.has(label)) out.set(label, { label, assets: assets.map((a) => ({ name: a.name, color: a.color, bought: 0, sold: 0 })) });
    const x = out.get(label).assets.find((a) => a.name === t.asset);
    if (t.amount > 0) x.bought += t.amount; else x.sold -= t.amount;
  }
  return [...out.values()];
}

export const inr = (x) => (Math.abs(x) >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : `₹${(x / 1e5).toFixed(2)} L`);
export const pct = (x, d = 1) => `${x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(d)}%`;
