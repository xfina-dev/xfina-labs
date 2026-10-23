// What the steps share: the rebalancing strategies ticked in step 3 with their settings, and every run made.
// A run adds one entry per ticked strategy to the history, kept in this browser only (like the data), and
// ticks them for comparison alongside those already ticked (six at most, newest first). In the mock an
// entry's figures come from resultsData by strategy; the engine will return them per run.
import { reactive, watch, computed } from 'vue';
import { ASSETS } from './mockData.js';
import { START, END } from './resultsData.js';
import { DEFAULT_PLAN, salarySpan } from './plan.js';

export const STRATEGIES = [
  { id: 'hold', name: 'No rebalancing (buy and hold)', desc: 'Set weights once, never trade. Shows how far the portfolio drifts.' },
  { id: 'calendar', name: 'Calendar rebalance', desc: 'Restore targets on a schedule: every year or every half-year.' },
  { id: 'threshold', name: 'Threshold rebalance', desc: 'Trade only when an asset drifts past a band around its target.' },
  { id: 'perpetual', name: 'Perpetual rebalance', desc: 'New money buys underweights; sell only past a drift limit.' },
];

// Step 3: which strategies a run includes (Perpetual by default, at least one), and each one's settings.
export const rebalancing = reactive({
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
export const investments = reactive({ ...DEFAULT_PLAN, endMonth: thisMonth });
export const selection = reactive({ series: [], reference: [], period: { from: START, to: END } }); // [{ tab, asset, series, type }]

// Step 2's allocation lists exactly the assets step 1 uses, named as there; when two regions share a name
// (the two short-duration debts) the region comes first. An asset keeps its weight, colour and place while it
// stays picked; a newly picked one joins at the end with the next free colour, at the mock's default weight
// for the default picks and 0 otherwise. Synchronous, so the first run already sees the allocation.
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
    ...added.map((x, k) => ({ key: `${x.tab}|${x.asset}`, weight: DEFAULT_WEIGHTS[`${x.tab}|${x.asset}`] ?? 0, color: free[k] ?? 'chart-16' })),
  ].map((a) => {
    const x = picks.find((y) => `${y.tab}|${y.asset}` === a.key);
    return { ...a, name: shared(x) ? `${x.tab} · ${x.asset}` : x.asset, type: x.type };
  });
  ASSETS.splice(0, ASSETS.length, ...next);
}, { flush: 'sync', immediate: true });

// Contributions fall inside the run: a start before the run's first month moves up to it, and an end past
// its last month (this month, by default) comes back to it.
const monthOfDate = (d) => d.slice(0, 7);
watch(() => [selection.period.from, selection.period.to], ([from, to]) => {
  if (investments.startMonth < monthOfDate(from)) investments.startMonth = monthOfDate(from);
  if (investments.endMonth > monthOfDate(to)) investments.endMonth = monthOfDate(to);
}, { flush: 'sync', immediate: true });

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
const KEY = 'xfina_labs_portfolio_engine_history_v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } })();
export const history = reactive(saved || { entries: [], compare: [], selected: null });
watch(history, (h) => { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* history lasts this visit only */ } }, { deep: true });

// Which Results tab is showing: History, Comparison or Result; and which region Select Assets shows, which
// How to get data opens at. Not saved: a visit opens on the result, and on India.
export const ui = reactive({ tab: 'result', region: 'india' });

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

let seq = 0;
export function run() {
  const at = new Date().toISOString();
  const added = rebalancing.ticked.map((id) => ({
    key: `${Date.now().toString(36)}-${seq++}`, strategy: id, label: labelOf(id), allocation: allocationOf(), period: { ...selection.period }, at, settings: snapshot(id),
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
}
export function remove(key) {
  history.entries = history.entries.filter((e) => e.key !== key);
  history.compare = history.compare.filter((k) => k !== key);
  if (history.selected === key) history.selected = history.compare[0] ?? history.entries[0]?.key ?? null;
}
export function clearAll() {
  ui.tab = 'history';
  history.entries = [];
  history.compare = [];
  history.selected = null;
}
export function toggleCompare(key) {
  const c = history.compare;
  if (c.includes(key)) c.splice(c.indexOf(key), 1);
  else if (c.length < MAX_COMPARE) c.push(key);
}

