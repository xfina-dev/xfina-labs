// What the steps share: the rebalancing strategies ticked in step 3 with their settings, and every run made.
// A run adds one entry per ticked strategy to the history, kept in this browser only (like the data), and
// ticks them for comparison alongside those already ticked (six at most, newest first). Each entry carries
// the engine's result for its strategy, and the entries of one run share the run-level figures in
// `history.runs` -- the months, the contributions and the inflation, which do not depend on the strategy.
import { reactive, watch, computed } from 'vue';
import { ASSETS } from './allocation.js';
import { DEFAULT_PLAN, salarySpan } from './plan.js';
import { runBacktest, referencePoints } from './engine.js';
import { resident } from './imports.js';

// What the four steps were set to last time. Imports are kept in IndexedDB (vault.js) because they are
// megabytes; the settings on top of them are a few hundred bytes, so they live here. Together they are what
// "reloading changes nothing" means: the same files, the same picks, the same weights, the same plan.
const SETTINGS_KEY = 'xfina_labs_portfolio_engine_settings_v1';
const savedSettings = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })();

// Which series each asset uses: asset key → series key, or null for an asset left out. Written by Select
// Assets, kept here so it survives a reload with the imports it refers to.
export const picks = reactive(savedSettings.picks ?? {});

export const STRATEGIES = [
  { id: 'hold', name: 'No rebalancing (buy and hold)', desc: 'Set weights once, never trade. Shows how far the portfolio drifts.' },
  { id: 'calendar', name: 'Calendar rebalance', desc: 'Restore targets on a schedule: every year or every half-year.' },
  { id: 'threshold', name: 'Threshold rebalance', desc: 'Trade only when an asset drifts past a band around its target.' },
  { id: 'perpetual', name: 'Perpetual rebalance', desc: 'New money buys underweights; sell only past a drift limit.' },
];

// Step 3: which strategies a run includes (Perpetual by default, at least one), and each one's settings.
export const rebalancing = reactive(savedSettings.rebalancing ?? {
  ticked: ['perpetual'],
  calendar: { frequency: 'Annual', month: 'January' },
  threshold: { bandType: 'Absolute', bandAll: 5, rangeOwn: {} },
  perpetual: { maxDrift: 10, minDrift: 5, sellMonths: 6, ltcgOnly: 'Yes' },
});
export const toggleTicked = (id) => {
  const t = rebalancing.ticked;
  if (t.includes(id)) { if (t.length > 1) t.splice(t.indexOf(id), 1); } else t.push(id);
};

// Step 2's investments, and what step 1 picked: the series each asset uses (null when left out) and the run's
// period. The sections write these; a run snapshots them so its result can show the full settings later.
const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
// Step 4's plan (plan.js): the lumpsum, salary and savings rate with their curves, the investment day and the
// contribution months. The end starts at this month and comes back to the run's last month.
export const investments = reactive(savedSettings.investments ?? { ...DEFAULT_PLAN, endMonth: thisMonth });
// The period comes from the data: Select Assets sets it to the dates every picked series shares, and until
// something is imported there is nothing to run.
export const selection = reactive({ series: [], reference: [], period: { from: null, to: null } }); // [{ tab, asset, series, type, files, ccy }]

// Step 2's allocation lists exactly the assets step 1 uses, named as there; when two regions share a name
// (the two short-duration debts) the region comes first. An asset keeps its weight, colour and place while it
// stays picked; a newly picked one joins at the end with the next free colour, at the mock's default weight
// for the default picks and 0 otherwise. Synchronous, so the first run already sees the allocation.
// What each asset was given last time, by asset key, so a reload comes back to the allocation that was set
// rather than to the defaults.
const SAVED = new Map((savedSettings.allocation ?? []).map((a) => [a.key, a]));
const DEFAULT_WEIGHTS = {
  'India|Nifty 50': 25, 'India|Nifty Next 50': 10, 'India|Nifty Midcap 150': 10, 'India|Debt · Short duration': 10,
  'US|S&P 500': 15, 'US|Nasdaq 100': 15, 'US|Debt · Short duration': 5, 'Global|MSCI World': 10,
};
watch(() => selection.series.map((x) => `${x.tab}|${x.asset}|${x.type}`).join(), () => {
  const picks = selection.series;
  const shared = (x) => picks.filter((y) => y.asset === x.asset).length > 1;
  const was = new Map(ASSETS.map((a) => [a.key, a]));
  const keys = picks.map((x) => `${x.tab}|${x.asset}`);
  const kept = ASSETS.filter((a) => keys.includes(a.key));
  const added = picks.filter((x) => !was.has(`${x.tab}|${x.asset}`));
  const free = Array.from({ length: 16 }, (_, k) => `chart-${k + 1}`).filter((c) => !kept.some((a) => a.color === c));
  const next = [
    ...kept,
    ...added.map((x, k) => {
      const key = `${x.tab}|${x.asset}`, was = SAVED.get(key);
      return { key, weight: was?.weight ?? DEFAULT_WEIGHTS[key] ?? 0, color: was?.color ?? free[k] ?? 'chart-16' };
    }),
  ].map((a) => {
    const x = picks.find((y) => `${y.tab}|${y.asset}` === a.key);
    return { ...a, name: shared(x) ? `${x.tab} · ${x.asset}` : x.asset, type: x.type };
  });
  ASSETS.splice(0, ASSETS.length, ...next);
}, { flush: 'sync', immediate: true });

// Contributions fall inside the run: a start before the run's first month moves up to it, and an end past
// its last month (this month, by default) comes back to it.
const monthOfDate = (d) => d.slice(0, 7);
// Until the user sets a contribution month themselves, the window simply is the run: importing more history
// widens it, and the months never stick to a period that has since moved. Once a month is theirs it stays
// theirs, and is only brought back inside the run when the run no longer covers it.
let autoMonths = savedSettings.autoMonths ?? true;
let syncing = false;
const clamp = (m, lo, hi) => (m < lo ? lo : m > hi ? hi : m);
watch(() => [selection.period.from, selection.period.to], ([from, to]) => {
  if (!from || !to) return;
  const lo = monthOfDate(from), hi = monthOfDate(to);
  syncing = true;
  if (autoMonths) {
    investments.startMonth = lo;
    investments.endMonth = hi;
  } else {
    investments.startMonth = clamp(investments.startMonth, lo, hi);
    investments.endMonth = clamp(investments.endMonth, investments.startMonth, hi);
  }
  syncing = false;
}, { flush: 'sync', immediate: true });
watch(() => [investments.startMonth, investments.endMonth], () => { if (!syncing) autoMonths = false; }, { flush: 'sync' });

// A strategy and its settings in a few words, e.g. "Perpetual · 10% → 5% over 6 months, LTCG only".
export function labelOf(id, s = rebalancing) {
  if (id === 'hold') return 'Buy and hold';
  if (id === 'calendar') return `Calendar · ${s.calendar.frequency}, ${s.calendar.month}`;
  if (id === 'threshold') return `Threshold · ${s.threshold.bandType} ±${s.threshold.bandAll}%${Object.keys(s.threshold.rangeOwn).length ? ', own ranges' : ''}`;
  return `Perpetual · ${s.perpetual.maxDrift}% → ${s.perpetual.minDrift}% over ${s.perpetual.sellMonths} months${s.perpetual.ltcgOnly === 'Yes' ? ', LTCG only' : ''}`;
}
const allocationOf = () => ASSETS.map((a) => `${a.name} ${a.weight}`).join(' · ');
// Everything a result was run with, copied so later changes to the steps don't alter it.
const snapshot = (id) => JSON.parse(JSON.stringify({
  allocation: ASSETS.map((a) => ({ name: a.name, weight: a.weight })),
  investments, series: selection.series, reference: selection.reference, strategy: { id, ...(id === 'hold' ? {} : rebalancing[id]) },
}));

// The history: every result, newest first. `compare` holds the keys ticked for comparison (at most six);
// `selected` is the one the detail shows.
export const MAX_COMPARE = 6;
// v2: an entry now carries the engine's own result, and the entries of one run share the run-level figures
// in `runs`, keyed by the time they share. A v1 history held the mock's strategy id and nothing else, so it
// is dropped rather than migrated: there is nothing in it to show.
const KEY = 'xfina_labs_portfolio_engine_history_v2';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } })();
export const history = reactive(saved || { entries: [], runs: {}, compare: [], selected: null });
try { localStorage.removeItem('xfina_labs_portfolio_engine_history_v1'); } catch { /* nothing to drop */ }

// A run's own figures are kilobytes, not bytes: a twenty-year monthly path and every transaction it made.
// They still fit, but a long history of them may not, so a write that overflows drops the oldest runs'
// detail and tries again rather than losing the history.
function persist() {
  const write = (value) => localStorage.setItem(KEY, JSON.stringify(value));
  try {
    write(history);
    return;
  } catch { /* too big: try again with less */ }
  const light = (e, keep) => (keep ? e : { ...e, result: e.result && { ...e.result, transactions: [], weights: [] }, trimmed: true });
  for (const keep of [2, 1, 0]) {
    try {
      write({ ...history, entries: history.entries.map((e, i) => light(e, i < keep)) });
      return;
    } catch { /* smaller still */ }
  }
}
watch(history, persist, { deep: true });

// The engine's result for an entry, and the run-level figures its entry belongs to.
export const resultOf = (entry) => entry?.result ?? null;
export const runOf = (entry) => (entry ? history.runs[entry.at] ?? null : null);
// A result reloaded from a history too big to keep in full has its detail stripped; the cards that need it
// say so rather than drawing an empty chart.
export const isTrimmed = (entry) => !!entry?.trimmed;

// Which Results tab is showing: History, Comparison or Result; and which region Select Assets shows, which
// How to get data opens at. Not saved: a visit opens on the result, and on India.
export const ui = reactive({ tab: 'result', region: savedSettings.region ?? 'india' });

// Everything the steps are set to, saved as it changes. Small enough for localStorage, and separate from the
// history, so clearing the runs does not clear the setup or the other way round.
watch([picks, ASSETS, investments, rebalancing, () => ui.region], () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      picks,
      allocation: ASSETS.map((a) => ({ key: a.key, weight: a.weight, color: a.color })),
      investments,
      rebalancing,
      region: ui.region,
      autoMonths,
    }));
  } catch { /* the settings last this visit only */ }
}, { deep: true });

// What changed since the last run, step by step: each step's settings now, against the same settings recorded
// with the newest run (the entries a run adds share its time). Run is only needed when something differs.
// The allocation's order and colours don't count; nor does a series' type, which comes with the series.
const sigData = (series, reference, period) => JSON.stringify([series.map((x) => [x.tab, x.asset, x.series]), reference.map((x) => [x.asset, x.series]), [period.from, period.to]]);
const sigPortfolio = (allocation) => JSON.stringify([...allocation].map((a) => [a.name, Number(a.weight) || 0]).sort());
// The plan's own fields, and where the salary ends: whether that was entered as an ending salary or as a growth
// rate doesn't matter, only the salary it gives.
const PLAN_KEYS = ['lumpsum', 'salaryStart', 'salaryCurve', 'rateStart', 'rateEnd', 'rateCurve', 'investDay', 'startMonth', 'endMonth'];
const sigInvestments = (inv) => JSON.stringify([...PLAN_KEYS.map((k) => String(inv[k] ?? '')), String(Math.round(salarySpan(inv).end))]);
const sigRebalancing = (strategies) => JSON.stringify([...strategies].sort((a, b) => a.id.localeCompare(b.id)));
const strategyOf = (id, settings) => ({ id, ...(id === 'hold' ? {} : settings) });
export const changed = computed(() => {
  const latest = history.entries[0];
  const last = latest ? history.entries.filter((e) => e.at === latest.at && e.settings) : [];
  if (!last.length) return { data: false, portfolio: false, rebalancing: false, investments: false, any: true };
  const s = last[0].settings;
  const now = {
    data: sigData(selection.series, selection.reference, selection.period),
    portfolio: sigPortfolio(ASSETS),
    investments: sigInvestments(investments),
    rebalancing: sigRebalancing(rebalancing.ticked.map((id) => strategyOf(id, rebalancing[id]))),
  };
  const then = {
    data: sigData(s.series, s.reference, last[0].period),
    portfolio: sigPortfolio(s.allocation),
    investments: sigInvestments(s.investments),
    rebalancing: sigRebalancing(last.map((e) => { const { id, ...rest } = e.settings.strategy; return strategyOf(id, rest); })),
  };
  const out = Object.fromEntries(Object.keys(now).map((k) => [k, now[k] !== then[k]]));
  return { ...out, any: Object.values(out).some(Boolean) };
});

// What a run assumes that no dataset in it states. Flat rates, like the plan's income tax: the engine takes
// them as numbers so they are stated once, here, rather than buried in the arithmetic.
export const ASSUMPTIONS = {
  ltcgRate: 12.5, // long-term capital gains, a percent of the gain
  stcgRate: 20, // a lot sold inside a year
  riskFree: 6.5, // what Sharpe and Sortino are measured over, a percent a year
  inflation: 6, // only used when no CPI series was picked; with one, the run's own CPI decides
};

export const runState = reactive({ busy: false, error: null });

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
// The plan as the engine takes it: the page's own fields, with the text inputs read as numbers.
const planRequest = () => ({
  lumpsum: num(investments.lumpsum),
  salaryStart: num(investments.salaryStart) * (investments.salaryPer === 'year' ? 1 : 12),
  salaryBy: investments.salaryBy,
  salaryGrowth: num(investments.salaryGrowth),
  salaryEnd: num(investments.salaryEnd) * (investments.salaryPer === 'year' ? 1 : 12),
  salaryCurve: investments.salaryCurve,
  taxRate: num(investments.taxRate),
  rateStart: num(investments.rateStart),
  rateEnd: num(investments.rateEnd),
  rateCurve: investments.rateCurve,
  investDay: investments.investDay,
  startMonth: investments.startMonth,
  endMonth: investments.endMonth,
});

// Why a run cannot go ahead, in a sentence, or null when it can.
export const blocked = computed(() => {
  if (!selection.series.length) return 'Import a dataset in Select Assets first: a run needs at least one asset with a series.';
  if (!selection.period.from) return 'No period: the picked series share no dates.';
  const allocated = ASSETS.filter((a) => Number(a.weight) > 0);
  if (!allocated.length) return 'Give at least one asset a weight in Set Allocation.';
  const missing = allocated.filter((a) => !selection.series.some((x) => `${x.tab}|${x.asset}` === a.key));
  if (missing.length) return `${missing.map((a) => a.name).join(', ')} has a weight but no series picked.`;
  const foreign = allocated.some((a) => (selection.series.find((x) => `${x.tab}|${x.asset}` === a.key)?.ccy ?? 'INR') !== 'INR');
  if (foreign && !selection.reference.some((r) => r.type === 'FX')) return 'An asset is quoted in dollars: pick a USD/INR series under Reference.';
  return null;
});

// The reference series the run needs, fetched from Xfina Data: USD/INR to turn dollars into rupees, and a
// consumer price index for the Real unit. Published files, so the page reads them itself.
async function reference() {
  const pick = (type) => selection.reference.find((r) => r.type === type);
  const fx = pick('FX');
  const cpi = pick('CPI');
  const [fxPoints, cpiPoints] = await Promise.all([
    fx ? referencePoints(fx.path) : Promise.resolve([]),
    cpi ? referencePoints(cpi.path) : Promise.resolve([]),
  ]);
  return { fx: fxPoints, cpi: cpiPoints };
}

let seq = 0;
/// Runs the ticked strategies over the picked data and adds one entry per strategy to the history.
export async function run() {
  if (runState.busy) return;
  runState.error = blocked.value;
  if (runState.error) return;
  runState.busy = true;
  try {
    const { fx, cpi } = await reference().catch(() => ({ fx: [], cpi: [] }));
    const picks = ASSETS.filter((a) => Number(a.weight) > 0).map((a) => ({
      asset: a,
      picked: selection.series.find((x) => `${x.tab}|${x.asset}` === a.key),
    }));
    // The engine's handles do not outlive the tab, but the imports do: this puts the bytes of just the files
    // this run needs back into the module, parsing only what is not already there.
    const handles = await resident(picks.flatMap(({ picked }) => picked?.files ?? []));
    const assets = picks.map(({ asset, picked }) => ({
      name: asset.name,
      weight: num(asset.weight),
      files: (picked?.files ?? []).map((id) => handles.get(id)).filter(Boolean),
      currency: picked?.ccy ?? 'INR',
    }));
    const strategies = rebalancing.ticked.map((id) => strategyOf(id, rebalancing[id]));
    const out = await runBacktest({
      assets,
      plan: planRequest(),
      strategies,
      period: { from: selection.period.from, to: selection.period.to },
      fx,
      cpi,
      ...ASSUMPTIONS,
    });
    if (out?.error) { runState.error = out.error.message; return; }

    const at = new Date().toISOString();
    const { results, ...shared } = out;
    history.runs[at] = shared;
    const added = rebalancing.ticked.map((id, i) => ({
      key: `${Date.now().toString(36)}-${seq++}`, strategy: id, label: labelOf(id), allocation: allocationOf(),
      period: { ...selection.period }, at, settings: snapshot(id),
      result: results.find((r) => r.id === id) ?? results[i],
    }));
    history.entries.unshift(...added);
    // The new entries are ticked; what the user ticked stays ticked and what they unticked stays unticked.
    // Past six, the oldest ticked ones drop off.
    const fresh = new Set(added.map((e) => e.key));
    const keep = history.entries.filter((e) => history.compare.includes(e.key) || fresh.has(e.key));
    history.compare = keep.slice(0, MAX_COMPARE).map((e) => e.key);
    history.selected = added[0].key;
    // Several new results open the comparison; one opens straight on its result.
    ui.tab = added.length > 1 ? 'comparison' : 'result';
  } catch (e) {
    runState.error = String(e?.message || e);
  } finally {
    runState.busy = false;
  }
}

// A run's figures are kept only while one of its entries is.
function sweepRuns() {
  const live = new Set(history.entries.map((e) => e.at));
  for (const at of Object.keys(history.runs)) if (!live.has(at)) delete history.runs[at];
}

export function remove(key) {
  history.entries = history.entries.filter((e) => e.key !== key);
  history.compare = history.compare.filter((k) => k !== key);
  if (history.selected === key) history.selected = history.compare[0] ?? history.entries[0]?.key ?? null;
  sweepRuns();
}
export function clearAll() {
  ui.tab = 'history';
  history.entries = [];
  history.runs = {};
  history.compare = [];
  history.selected = null;
}
export function toggleCompare(key) {
  const c = history.compare;
  if (c.includes(key)) c.splice(c.indexOf(key), 1);
  else if (c.length < MAX_COMPARE) c.push(key);
}

