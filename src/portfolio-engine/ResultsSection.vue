<script setup>
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Segmented } from 'xfina-ui';
import { Check, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Download, ChartLine } from 'lucide-vue-next';
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import logo from 'xfina-ui/logo.svg';
import FitChart from './FitChart.vue';
import ValueChart from './ValueChart.vue';
import GrowthChart from './GrowthChart.vue';
import DrawdownChart from './DrawdownChart.vue';
import AllocationChart from './AllocationChart.vue';
import DriftChart from './DriftChart.vue';
import TxChart from './TxChart.vue';
import WaterfallChart from './WaterfallChart.vue';
import ReturnsChart from './ReturnsChart.vue';
import { ASSETS, allocation } from './mockData.js';
import { planRows, salarySpan } from './plan.js';
import { downloadCsv, downloadJson, downloadPng } from './exportFiles.js';
import { history, MAX_COMPARE, remove, toggleCompare, clearAll, run, STRATEGIES, ui } from './store.js';
import { results, yearly, monthly, transactions, tradesBy, invested, investedToday, toToday, monthOf, inr, pct, START_YEAR, MONTHS } from './resultsData.js';

// Results in three parts: the history of every run (newest first; up to six ticked for comparison, the latest
// six by default), a fixed comparison of the ticked ones, and the detail of one, where the toggles are. With
// one ticked there is nothing to compare, so only the detail shows. Figures are a design mock (resultsData.js):
// in the mock they depend only on the strategy.
// A first visit starts with one run of the defaults, so Results has something to show. Run once the steps
// above have mounted, so the run records their choices.
onMounted(() => { if (!history.entries.length) run(); });

// Clear all asks once, in place, before deleting every saved run.
const confirmClear = ref(false);
const clearHistory = () => { clearAll(); confirmClear.value = false; };

const resultOf = (e) => results.find((r) => r.id === e.strategy);
const times = (a, b) => `${(a / b).toFixed(2)}×`;
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// The history sorts by any column (newest run first by default); sorting only changes the listing.
const SORTS = {
  label: (e) => e.label,
  period: (e) => e.period.from,
  final: (e) => resultOf(e).final,
  xirr: (e) => (today.value ? resultOf(e).xirrReal : resultOf(e).xirr),
  mdd: (e) => (today.value ? resultOf(e).mddReal : resultOf(e).mdd),
  at: (e) => e.at,
};
const sort = ref({ key: 'at', dir: -1 });
const sortBy = (key) => { sort.value = { key, dir: sort.value.key === key ? -sort.value.dir : key === 'label' || key === 'period' ? 1 : -1 }; };
const sorted = computed(() => {
  const f = SORTS[sort.value.key], d = sort.value.dir;
  return [...history.entries].sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * d; });
});
const ariaSort = (key) => (sort.value.key !== key ? 'none' : sort.value.dir > 0 ? 'ascending' : 'descending');

const compared = computed(() => history.entries.filter((e) => history.compare.includes(e.key)));
const entry = computed(() => history.entries.find((e) => e.key === history.selected) ?? compared.value[0] ?? history.entries[0] ?? null);
const res = computed(() => (entry.value ? resultOf(entry.value) : null));
const select = (e) => { history.selected = e.key; };
// Opening a result (a History row, or View in Comparison) switches to the Result tab and brings it into view.
// Result first (where a run lands), then Comparison, then History (where runs are managed).
const TABS = computed(() => [
  { id: 'result', label: 'Result', disabled: !history.entries.length },
  { id: 'comparison', label: 'Comparison', count: compared.value.length, disabled: compared.value.length < 2, hint: 'Tick at least two runs in History to compare them' },
  { id: 'history', label: 'History', count: history.entries.length },
]);
// Switching tab from further down brings the top of Results back into view, with the pinned bar where it
// starts; from above, nothing moves.
const rootEl = ref(null);
// While the bar is pinned (Runs scrolled past the top of the window), its header shows the brand, Xfina Labs /
// Portfolio Engine, so the page keeps it on screen; in place, it shows the section's own header.
const stuck = ref(false);
const onScroll = () => { stuck.value = (rootEl.value?.getBoundingClientRect().top ?? 1) < 0; };
onMounted(() => { addEventListener('scroll', onScroll, { passive: true }); onScroll(); });
onBeforeUnmount(() => removeEventListener('scroll', onScroll));
const showTab = (id) => {
  ui.tab = id;
  nextTick(() => { const top = rootEl.value?.getBoundingClientRect().top ?? 0; if (top < 0) window.scrollBy({ top, behavior: 'smooth' }); });
};
// View: show a compared result below and bring it into view.
const openResult = (e) => { select(e); showTab('result'); };
// Rows that define a column (the period and the allocation) show every column: muted where they match the
// first column, and standing out where they differ.
// The allocation as rows, one per asset across every compared run, with each run's weight in its column (— for
// an asset a run didn't hold). Runs saved before settings were recorded fall back to the allocation text.
const weightsOf = (e) => e.settings?.allocation
  ?? e.allocation.split(' · ').map((x) => { const m = x.match(/^(.*) (\d+)$/); return m ? { name: m[1], weight: Number(m[2]) } : null; }).filter(Boolean);
const allocationRows = computed(() => {
  const names = [...new Set(compared.value.flatMap((e) => weightsOf(e).map((a) => a.name)))];
  return names.map((name) => {
    const cells = compared.value.map((e) => weightsOf(e).find((a) => a.name === name)?.weight ?? null);
    return { name, cells, same: cells.every((c) => c === cells[0]) };
  });
});

// One Nominal | Real switch at the top governs everything below: the history's figures, the comparison and the
// detail. Real is in today's rupees: every contribution carried forward by inflation to the run's end.
const unit = ref('Nominal');
const today = computed(() => unit.value === 'Real');

// --- Comparison: fixed rows (the switch above is the only thing that changes them) -----------------------
// Four groups: what it came to, the returns, the risks, and what rebalancing did. Each row is
// [label, the value, how it shows, which way is better]: 'high', 'low', or null where there is no best
// (Invested is an input, the same for every run).
function groupsFor(t) {
  const inv = (r) => (t ? r.investedToday : r.invested);
  return [
    { title: 'Overview', rows: [
      ['Invested', inv, inr, null],
      ['Growth', (r) => r.final - inv(r), inr, 'high'],
      ['Final value', (r) => r.final, inr, 'high'],
      ['Post tax, if sold at the end', (r) => r.postTax, inr, 'high'],
    ] },
    { title: 'Returns', rows: [
      ['XIRR · your money', (r) => (t ? r.xirrReal : r.xirr), pct, 'high'],
      ['CAGR · the portfolio', (r) => (t ? r.twrReal : r.twr), pct, 'high'],
    ] },
    { title: 'Risks', highlight: true, rows: [
      ['Volatility', (r) => r.vol, (v) => `${pct(v)} a year`, 'low'],
      ['Max drawdown', (r) => (t ? r.mddReal : r.mdd), pct, 'high'],
      ['Sharpe', (r) => (t ? r.sharpeReal : r.sharpe), (v) => v.toFixed(2), 'high'],
      ['Sortino', (r) => (t ? r.sortinoReal : r.sortino), (v) => v.toFixed(2), 'high'],
      ['Calmar', (r) => (t ? r.calmarReal : r.calmar), (v) => v.toFixed(2), 'high'],
    ] },
    { title: 'Rebalancing', rows: [
      ['Tax paid on rebalancing', (r) => (t ? r.taxesPaidToday : r.taxesPaid), inr, 'low'],
      ['Turnover', (r) => r.turnover, (v) => `${pct(v)} a year`, 'low'],
      ['Trades (sales)', (r) => r.trades, String, 'low'],
    ] },
  ];
}
const GROUPS = computed(() => groupsFor(today.value));
// Only the Risks rows mark a best cell: elsewhere the more-money, less-trading strategy wins nearly every row,
// and a column of green would read as a verdict. The best cell in a row: the best value as shown (so equal-looking values tie); none when every column is
// the same or the row has no best.
function isBest(row, e) {
  const [, val, show, better] = row;
  if (!better || compared.value.length < 2) return false;
  const shown = compared.value.map((x) => show(val(resultOf(x))));
  if (new Set(shown).size === 1) return false;
  const vals = compared.value.map((x) => val(resultOf(x)));
  const best = better === 'high' ? Math.max(...vals) : Math.min(...vals);
  return show(val(resultOf(e))) === show(best);
}
// A result's value line in the chosen unit (today's rupees for Real).
const valueIn = (r) => (today.value ? r.value.map((v, m) => v * toToday(m)) : r.value);

// --- Run settings: everything the selected result was run with ------------------------------------------------
const settings = computed(() => entry.value?.settings ?? null);
// The assets as one table: each allocated asset with its weight and the series it used. The series list names an
// asset by tab and asset, the allocation by its display name (with the region first when two regions share a
// name). A series without a weight, as in older runs, still shows, as does a weight without a series.
const seriesFor = (st, name) => st.series.find((x) => name === x.asset || name === `${x.tab} · ${x.asset}`);
const assetRows = computed(() => {
  const st = settings.value;
  if (!st) return [];
  const rows = st.allocation.map((a) => ({ name: a.name, series: seriesFor(st, a.name)?.series ?? '—', weight: a.weight }));
  const unweighted = st.series.filter((x) => !st.allocation.some((a) => seriesFor(st, a.name) === x)).map((x) => ({ name: `${x.tab} · ${x.asset}`, series: x.series, weight: null }));
  return [...rows, ...unweighted];
});
// The plan a run used, in a few rows: salary and savings rate as start → end with their curves, and what they
// came to a month. Runs saved before the plan had a salary keep their monthly amount and yearly hike.
const planSummary = computed(() => {
  const inv = settings.value?.investments;
  if (!inv || !('salaryStart' in inv)) return null;
  // Plans saved when the salary was entered a month at a time: read as a year's
  const p = inv.salaryPer === 'year' ? inv : { ...inv, salaryStart: inv.salaryStart * 12, salaryEnd: inv.salaryEnd * 12 };
  const rows = planRows(p), span = salarySpan(p), rs = (x) => `₹${Math.round(x).toLocaleString('en-IN')}`;
  return [
    ['Lumpsum', rs(Number(inv.lumpsum) || 0)],
    ['Salary, a year before tax', `${rs(rows[0].salaryYear)} → ${rs(span.end)}`],
    ['Salary growth', `${(span.growth * 100).toFixed(1)}% a year, ${inv.salaryCurve}`],
    ...('taxRate' in inv ? [['Income tax', `${inv.taxRate}% of salary, assumed`]] : []),
    ['Savings rate, of take-home', `${Math.round(rows[0].rate * 100)}% → ${Math.round(rows.at(-1).rate * 100)}%, ${inv.rateCurve}`],
    ['Monthly investment', `${rs(rows[0].monthly)} → ${rs(rows.at(-1).monthly)}`],
  ];
});
const strategyName = (id) => STRATEGIES.find((x) => x.id === id)?.name ?? id;
const strategyRows = computed(() => {
  const st = settings.value?.strategy;
  if (!st) return [];
  if (st.id === 'hold') return [['Trades', 'None: never back to target']];
  if (st.id === 'calendar') return [['How often', st.frequency], ['Month', st.month], ['Day', 'The investment day']];
  if (st.id === 'threshold') {
    const own = Object.entries(st.rangeOwn || {});
    // Own ranges: a heading row, then one indented row per asset with its range
    const ranges = own.length ? [['Own ranges', ''], ...own.map(([n, x]) => [n, `${x.lo}–${x.hi}%`, true])] : [['Own ranges', 'None']];
    return [['Band type', st.bandType], ['Band for all assets', `±${st.bandAll}%`], ...ranges, ['Checked', 'Monthly, on the investment day']];
  }
  return [['Start selling above', `${st.maxDrift}%`], ['Stop selling at', `${st.minDrift}%`], ['Step down over', `${st.sellMonths} months`], ['Sell LTCG lots only', st.ltcgOnly]];
});

// --- Detail: each card has its own Chart | Table and Monthly | Yearly toggles ------------------------------
// Returns and risks: the comparison's groups and rows for this one result, with a note under some figures and the
// definitions on hover. Final value and post tax are the figures that matter most, so they are bold.
const NOTES = {
  'XIRR · your money': { title: 'The return on your rupees, given when each one went in: the lumpsum, every monthly investment and its yearly hike. It changes with the contribution plan.' },
  'CAGR · the portfolio': { title: '₹1 in this asset mix and strategy over the run, with nothing added after: the figure to set against an index\'s CAGR. The contributions don\'t change it.' },
  'Max drawdown': { sub: (r, t) => `trough ${monthOf((t ? r.episodesReal : r.episodes)[0].trough)}` },
  Sharpe: { sub: () => 'over the repo rate', title: 'Return above the risk-free rate per unit of volatility. Risk-free: the RBI repo rate (the bank rate before April 2001), a policy rate rather than a return anyone earns.' },
  Sortino: { sub: () => 'downside only', title: 'Like Sharpe, but only falls below the risk-free rate count as risk: return above the repo rate per unit of downside volatility.' },
  Calmar: { sub: () => 'CAGR ÷ drawdown', title: 'Return per unit of the worst fall: CAGR divided by the max drawdown, over the whole run.' },
};
const STRONG = ['Final value', 'Post tax, if sold at the end'];
const output = computed(() => GROUPS.value.map((g) => ({
  title: g.title,
  rows: g.rows.map(([label, val, show]) => ({
    label, raw: val(res.value), value: show(val(res.value)), sub: NOTES[label]?.sub?.(res.value, today.value), title: NOTES[label]?.title, strong: STRONG.includes(label),
  })),
})));
const outView = ref('Table');
const returnsBars = computed(() => [
  { label: 'XIRR · your money', nominal: res.value.xirr, real: res.value.xirrReal },
  { label: 'CAGR · the portfolio', nominal: res.value.twr, real: res.value.twrReal },
]);
// The waterfall: invested, the growth before any tax, the tax paid on rebalancing along the way, the final
// value, the tax if it were all sold at the end, and what is left.
const waterfall = computed(() => {
  const r = res.value, t = today.value;
  const inv = t ? r.investedToday : r.invested, paid = t ? r.taxesPaidToday : r.taxesPaid;
  return [
    { label: ['Invested'], value: inv, total: true },
    { label: ['Growth,', 'before tax'], value: r.final + paid - inv },
    { label: ['Tax on', 'rebalancing'], value: -paid },
    { label: ['Final', 'value'], value: r.final, total: true },
    { label: ['Tax if', 'sold'], value: r.postTax - r.final },
    { label: ['Post tax'], value: r.postTax, total: true },
  ];
});
// Investment and growth shows the growth or the transactions, each as a chart or a table, by month or year.
const show = ref('Growth');
const view = ref('Chart');
const step = ref('Yearly');
const valueLine = computed(() => valueIn(res.value));
const investedLine = computed(() => (today.value ? investedToday : invested));
const yearRows = computed(() => yearly(res.value, today.value));
const monthRows = computed(() => monthly(res.value, today.value));
const episodes = computed(() => (today.value ? res.value.episodesReal : res.value.episodes));
const months = (a, b) => (b === null ? '—' : `${b - a} mo`);

const txRows = computed(() => tradesBy(res.value, ASSETS, today.value, step.value === 'Yearly'));
const ddView = ref('Chart');

// Allocation and drift: month by month, or each year's end (the last point is the run's last month).
const allocView = ref('Chart');
const allocStep = ref('Yearly');
// Mock: how far the weights wander depends on the strategy (buy and hold furthest), until the engine returns them.
const DRIFT_SIZE = { hold: 1.2, calendar: 0.45, threshold: 0.5, perpetual: 0.56 };
const allocMonthly = computed(() => allocation(MONTHS, DRIFT_SIZE[res.value.id] ?? 1));
const YEAR_ENDS = [...Array.from({ length: Math.floor(MONTHS / 12) }, (_, k) => 12 * k + 11), ...(MONTHS % 12 ? [MONTHS - 1] : [])];
const allocRows = computed(() => (allocStep.value === 'Monthly'
  ? allocMonthly.value.map((w, m) => ({ label: monthOf(m), w }))
  : YEAR_ENDS.map((m) => ({ label: String(START_YEAR + Math.floor(m / 12)), w: allocMonthly.value[m] }))));
// Drift: each asset's weight less its target (positive when overweight), and the total drift, the sum of the
// overweights (equal to the sum of the underweights). Perpetual sells on the total; Threshold on each asset.
const allocShow = ref('Allocation');
const driftRows = computed(() => {
  const sum = ASSETS.reduce((a, x) => a + Number(x.weight || 0), 0) || 1;
  const target = ASSETS.map((a) => Number(a.weight || 0) / sum);
  return allocRows.value.map((r) => {
    const drift = r.w.map((w, k) => w - target[k]);
    return { label: r.label, drift, total: drift.reduce((a, d) => a + Math.max(0, d), 0) };
  });
});
const driftLimits = computed(() => {
  const st = settings.value?.strategy;
  if (st?.id === 'perpetual') return [{ value: st.maxDrift / 100, label: `Starts selling: ${st.maxDrift}%`, tone: 'critical' }, { value: st.minDrift / 100, label: `Stops at: ${st.minDrift}%`, tone: 'good', below: true }];
  if (st?.id === 'threshold' && st.bandType === 'Absolute') return [{ value: st.bandAll / 100, label: `Band +${st.bandAll}%`, tone: 'critical' }, { value: -st.bandAll / 100, label: `Band −${st.bandAll}%`, tone: 'critical', below: true }];
  return [];
});
// The drift chart's legend switches lines on and off; Total only and Show all are the shortcuts.
const driftHidden = ref([]);
const driftTotal = ref(true);
const toggleDrift = (name) => { const h = driftHidden.value; driftHidden.value = h.includes(name) ? h.filter((n) => n !== name) : [...h, name]; };
const driftOnlyTotal = computed(() => driftTotal.value && driftHidden.value.length === ASSETS.length);
const driftAll = computed(() => driftTotal.value && !driftHidden.value.length);
const showDriftTotalOnly = () => { driftTotal.value = true; driftHidden.value = ASSETS.map((a) => a.name); };
const showDriftAll = () => { driftTotal.value = true; driftHidden.value = []; };
const signed = (x) => `${x > 0.0005 ? '+' : x < -0.0005 ? '−' : ''}${Math.abs(x * 100).toFixed(1)}%`;
// --- Exports -------------------------------------------------------------------------------------------------
// Each card exports what it shows: the chart as PNG, or the table as CSV, in the chosen unit. The JSON button
// saves everything about the selected result as JSON. Amounts are whole rupees; percentages are in percent.
const outChart = ref(null), igBox = ref(null), ddBox = ref(null), alBox = ref(null);
// File names start with the run's time (local, to the second) and strategy, so exports from different runs
// never clash: backtest-20261010-143205-perpetual-nominal-drawdown.png.
const runStamp = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const runBase = computed(() => `backtest-${runStamp(entry.value.at)}-${entry.value.strategy}`);
const fileBase = computed(() => `${runBase.value}-${unit.value.toLowerCase()}`);
const pngTitle = (card) => `${card} · ${entry.value.label} · ${unit.value} · ${entry.value.period.from} → ${entry.value.period.to}`;
const rupees = (x) => Math.round(x);
const percent = (x) => Number((x * 100).toFixed(2));

function exportOutput() {
  if (outView.value === 'Chart') return downloadPng(outChart.value, `${fileBase.value}-returns-risks.png`, pngTitle('Returns and risks'));
  downloadCsv(`${fileBase.value}-returns-risks.csv`, [['group', 'metric', 'value', 'shown', 'note'], ...output.value.flatMap((g) => g.rows.map((a) => [g.title, a.label, Math.abs(a.raw) >= 1000 ? rupees(a.raw) : Number(a.raw.toFixed(4)), a.value, a.sub ?? '']))]);
}
function exportGrowth() {
  const name = `${fileBase.value}-${show.value.toLowerCase()}-${step.value.toLowerCase()}`;
  if (view.value === 'Chart') return downloadPng(igBox.value, `${name}.png`, pngTitle(`${show.value === 'Growth' ? 'Investment and growth' : 'Transactions'}, ${step.value.toLowerCase()}`));
  if (show.value === 'Growth') {
    const rows = step.value === 'Yearly' ? yearRows.value : monthRows.value;
    return downloadCsv(`${name}.csv`, [[step.value === 'Yearly' ? 'year' : 'month', 'contribution', 'sold_to_rebalance', 'invested', 'growth', 'value', 'multiple'],
      ...rows.map((y) => [y.year ?? y.month, rupees(y.contribution), rupees(y.sold), rupees(y.invested), rupees(y.growth), rupees(y.value), (y.value / y.invested).toFixed(2)])]);
  }
  downloadCsv(`${name}.csv`, [[step.value === 'Yearly' ? 'year' : 'month', 'asset', 'bought', 'sold', 'net'],
    ...txRows.value.flatMap((r) => r.assets.filter((a) => a.bought || a.sold).map((a) => [r.label, a.name, rupees(a.bought), rupees(a.sold), rupees(a.bought - a.sold)]))]);
}
function exportDrawdown() {
  if (ddView.value === 'Chart') return downloadPng(ddBox.value, `${fileBase.value}-drawdown.png`, pngTitle('Drawdown'));
  downloadCsv(`${fileBase.value}-drawdowns.csv`, [['rank', 'peak', 'trough', 'recovered', 'depth_pct', 'months_peak_to_trough', 'months_to_recover'],
    ...episodes.value.map((d, i) => [i + 1, monthOf(d.peak), monthOf(d.trough), d.recovered === null ? '' : monthOf(d.recovered), percent(d.depth), d.trough - d.peak, d.recovered === null ? '' : d.recovered - d.trough])]);
}
function exportAllocation() {
  const name = `${runBase.value}-${allocShow.value.toLowerCase()}-${allocStep.value.toLowerCase()}`;
  if (allocView.value === 'Chart') return downloadPng(alBox.value, `${name}.png`, pngTitle(`${allocShow.value === 'Drift' ? 'Drift' : 'Allocation'} over time, ${allocStep.value.toLowerCase()}`));
  const period = allocStep.value === 'Yearly' ? 'year_end' : 'month';
  if (allocShow.value === 'Drift') {
    return downloadCsv(`${name}.csv`, [[period, 'total_drift_pct', ...ASSETS.map((a) => `${a.name}_pct`)], ...driftRows.value.map((r) => [r.label, percent(r.total), ...r.drift.map(percent)])]);
  }
  downloadCsv(`${name}.csv`, [[period, ...ASSETS.map((a) => `${a.name}_pct`)], ['target', ...ASSETS.map((a) => a.weight)], ...allocRows.value.map((r) => [r.label, ...r.w.map(percent)])]);
}
// Everything about the selected result: what it was run with, every figure in both units, the yearly and
// monthly rows, the drawdowns, and every transaction.
function exportResult() {
  const r = res.value, e = entry.value;
  const figures = (t) => groupsFor(t).map((g) => ({ group: g.title, rows: g.rows.map(([label, val]) => ({ label, value: val(r) })) }));
  const both = (f) => ({ nominal: f(false), real: f(true) });
  downloadJson(`${runBase.value}.json`, {
    result: e.label, strategy: e.strategy, period: e.period, ranAt: e.at, settings: e.settings ?? null, note: 'Design mock: the figures are illustrative.',
    figures: both(figures),
    yearly: both((t) => yearly(r, t)),
    monthly: both((t) => monthly(r, t)),
    drawdowns: both((t) => (t ? r.episodesReal : r.episodes).map((d) => ({ peak: monthOf(d.peak), trough: monthOf(d.trough), recovered: d.recovered === null ? null : monthOf(d.recovered), depth: d.depth }))),
    transactions: both((t) => transactions(r, ASSETS, t)),
  });
}
</script>

<template>
  <div ref="rootEl" class="space-y-8">
    <!-- Pinned to the top of the window while the results scroll: the section's header, the unit switch with what
         the unit means beside it (it changes every figure below, so it is the most prominent control here:
         Segmented's large primary variant, level with the Run button), and the tabs. -->
    <div class="sticky top-0 z-20 bg-background/95 pb-3 pt-3 backdrop-blur">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3">
        <h2 class="flex min-w-0 items-center gap-3">
          <template v-if="stuck">
            <img :src="logo" alt="" class="h-7 w-7 shrink-0" />
            <span class="truncate text-base"><span class="font-semibold">Xfina Labs</span><span class="text-muted-foreground"> / Portfolio Engine · </span><span class="font-semibold uppercase tracking-wide text-muted-foreground">Runs</span></span>
          </template>
          <template v-else>
            <span class="inline-grid place-items-center w-6 h-6 rounded-full bg-primary/10 text-primary-text"><ChartLine class="h-3.5 w-3.5" /></span>
            <span class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Runs</span>
          </template>
        </h2>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap">
          <div class="min-w-0 sm:text-right">
            <div class="font-semibold">{{ today ? 'Real: in today\'s rupees' : 'Nominal: in rupees of the day' }}</div>
            <p class="text-sm text-muted-foreground">{{ today ? 'Every amount carried forward by inflation to the run\'s end.' : 'As the money moved, before inflation.' }}</p>
          </div>
          <Segmented v-model="unit" :options="['Nominal', 'Real']" size="lg" variant="primary" label="Units for every figure in Results" class="shrink-0" />
        </div>
      </div>

      <!-- Three tabs: inspect one result, compare them, manage runs -->
      <div id="results-tabs" class="flex gap-1 border-b overflow-x-auto overflow-y-hidden" role="tablist" aria-label="Results">
        <button
          v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="ui.tab === t.id" :disabled="t.disabled" :title="t.disabled ? t.hint : ''"
          class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          :class="ui.tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="showTab(t.id)"
        >{{ t.label }}<span v-if="t.count !== undefined" class="ml-1 text-xs font-normal text-muted-foreground">{{ t.count }}</span></button>
      </div>
    </div>

    <!-- History: every run, newest first -->
    <Card v-if="ui.tab === 'history'" class="bg-card border-border shadow-sm">
      <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-4">
        <div class="space-y-1.5 min-w-0 flex-1 basis-80">
        <CardTitle class="text-xl">History</CardTitle>
        <CardDescription>
          Every run is kept in this browser. Tick up to {{ MAX_COMPARE }} to compare; a run's new results are ticked and yours stay as you left them. Click a row to open its result.
          <span class="block text-xs">Design mock: the figures are illustrative.</span>
        </CardDescription>
        </div>
        <div v-if="history.entries.length" class="flex shrink-0 items-center gap-2">
          <template v-if="confirmClear">
            <span class="text-sm">Clear all {{ history.entries.length }} run{{ history.entries.length > 1 ? 's' : '' }}?</span>
            <Button size="sm" variant="destructive" @click="clearHistory">Clear</Button>
            <Button size="sm" variant="outline" @click="confirmClear = false">Cancel</Button>
          </template>
          <Button v-else size="sm" variant="outline" @click="confirmClear = true"><Trash2 class="h-4 w-4 mr-2" />Clear all</Button>
        </div>
      </CardHeader>
      <CardContent>
        <p v-if="!history.entries.length" class="text-sm text-muted-foreground">No runs yet. Pick your choices above and press Run.</p>
        <!-- Fixed widths, so switching unit (11.3% to 5.0%) doesn't move the columns -->
        <Table v-else class="table-fixed min-w-[66rem]">
          <colgroup><col class="w-10" /><col /><col class="w-52" /><col class="w-32" /><col class="w-24" /><col class="w-36" /><col class="w-36" /><col class="w-16" /></colgroup>
          <TableHeader>
            <TableRow>
              <TableHead class="pr-0"><span class="sr-only">Compare</span></TableHead>
              <TableHead
                v-for="[key, label, right] in [['label', 'Result'], ['period', 'Period'], ['final', 'Final value', true], ['xirr', 'XIRR', true], ['mdd', 'Max drawdown', true], ['at', 'Run']]"
                :key="key" :aria-sort="ariaSort(key)" :class="right && 'text-right'"
              >
                <button type="button" class="inline-flex items-center gap-1 hover:text-foreground" :class="sort.key === key && 'text-foreground'" @click="sortBy(key)">
                  {{ label }}
                  <ArrowUp v-if="sort.key === key && sort.dir > 0" class="h-3.5 w-3.5" />
                  <ArrowDown v-else-if="sort.key === key" class="h-3.5 w-3.5" />
                  <ArrowUpDown v-else class="h-3.5 w-3.5 opacity-40" />
                </button>
              </TableHead>
              <TableHead><span class="sr-only">Remove</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="e in sorted" :key="e.key" class="cursor-pointer" :class="entry === e && 'bg-primary/5 hover:bg-primary/10'" @click="openResult(e)">
              <TableCell class="pr-0" @click.stop>
                <button
                  type="button" role="checkbox" :aria-checked="history.compare.includes(e.key)" :aria-label="`Compare ${e.label}`"
                  :disabled="!history.compare.includes(e.key) && history.compare.length >= MAX_COMPARE"
                  :title="!history.compare.includes(e.key) && history.compare.length >= MAX_COMPARE ? `Up to ${MAX_COMPARE} can be compared` : 'Compare'"
                  class="grid h-5 w-5 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  :class="history.compare.includes(e.key) ? 'border-status-good bg-status-good text-background' : 'border-muted-foreground/40 hover:border-primary'"
                  @click="toggleCompare(e.key)"
                ><Check v-if="history.compare.includes(e.key)" class="h-3.5 w-3.5" /></button>
              </TableCell>
              <TableCell>
                <div class="font-medium">{{ e.label }}</div>
                <div class="text-xs text-muted-foreground">{{ e.allocation }}</div>
              </TableCell>
              <TableCell class="whitespace-nowrap font-mono text-xs">{{ e.period.from }} → {{ e.period.to }}</TableCell>
              <TableCell class="whitespace-nowrap text-right tabular-nums">{{ inr(resultOf(e).final) }}</TableCell>
              <TableCell class="whitespace-nowrap text-right tabular-nums">{{ pct(today ? resultOf(e).xirrReal : resultOf(e).xirr) }}</TableCell>
              <TableCell class="whitespace-nowrap text-right tabular-nums">{{ pct(today ? resultOf(e).mddReal : resultOf(e).mdd) }}</TableCell>
              <TableCell class="whitespace-nowrap text-xs text-muted-foreground">{{ when(e.at) }}</TableCell>
              <TableCell class="px-2" @click.stop>
                <button type="button" class="mx-auto grid h-8 w-8 place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-status-critical-text" :aria-label="`Remove ${e.label} from the history`" title="Remove from the history" @click="remove(e.key)"><Trash2 class="h-4 w-4" /></button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Comparison: fixed, both units; click a column for its detail -->
    <p v-if="ui.tab === 'comparison' && compared.length < 2" class="text-sm text-muted-foreground">Tick at least two runs in <button type="button" class="font-medium text-foreground underline underline-offset-4" @click="ui.tab = 'history'">History</button> to compare them.</p>
    <Card v-if="ui.tab === 'comparison' && compared.length > 1" class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Comparison</CardTitle>
        <CardDescription>In Risks, the best value in each row is highlighted; which rows matter most is your call. Press View to open a result.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="overflow-x-auto">
          <!-- Equal columns, wide enough for a figure and its multiple on one line; the table scrolls inside the
               card when six columns don't fit -->
          <Table class="table-fixed" :style="{ minWidth: `${12 + compared.length * 9.25}rem` }">
            <colgroup><col class="w-48" /><col v-for="e in compared" :key="e.key" /></colgroup>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead v-for="e in compared" :key="e.key" class="text-right align-bottom" :class="entry === e && 'bg-primary/5'">
                  <span class="font-medium" :class="entry === e ? 'text-foreground' : 'text-muted-foreground'">{{ e.label }}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <!-- What defines each column. The period as a start row and an end row; a date that differs from the
                   first column changes every figure, so it is flagged -->
              <TableRow class="hover:bg-transparent"><TableCell :colspan="compared.length + 1" class="pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period</TableCell></TableRow>
              <TableRow v-for="[label, end] in [['Start', 'from'], ['End', 'to']]" :key="label">
                <TableCell>{{ label }}</TableCell>
                <TableCell
                  v-for="e in compared" :key="e.key" class="whitespace-nowrap text-right font-mono text-xs"
                  :class="[entry === e && 'bg-primary/5', e.period[end] === compared[0].period[end] ? 'text-muted-foreground' : 'font-semibold text-status-critical-text']"
                  :title="e.period[end] === compared[0].period[end] ? '' : 'A different date from the first column: the figures are not comparable'"
                >{{ e.period[end] }}</TableCell>
              </TableRow>
              <!-- The allocation, one row per asset; a weight that differs between runs stands out, equal ones are muted -->
              <TableRow class="hover:bg-transparent"><TableCell :colspan="compared.length + 1" class="pt-5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allocation</TableCell></TableRow>
              <TableRow v-for="a in allocationRows" :key="a.name">
                <TableCell>{{ a.name }}</TableCell>
                <TableCell
                  v-for="(w, k) in a.cells" :key="compared[k].key" class="whitespace-nowrap text-right tabular-nums"
                  :class="[entry === compared[k] && 'bg-primary/5', a.same ? 'text-muted-foreground' : 'font-medium']"
                >{{ w === null ? '—' : `${w}%` }}</TableCell>
              </TableRow>
              <template v-for="g in GROUPS" :key="g.title">
                <TableRow class="hover:bg-transparent"><TableCell :colspan="compared.length + 1" class="pt-5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ g.title }}</TableCell></TableRow>
                <TableRow v-for="row in g.rows" :key="g.title + row[0]">
                  <TableCell>{{ row[0] }}</TableCell>
                  <TableCell
                    v-for="e in compared" :key="e.key" class="whitespace-nowrap text-right tabular-nums"
                    :class="[entry === e && 'bg-primary/5 font-medium', g.highlight && isBest(row, e) && 'bg-status-good/10 font-semibold text-status-good-text']"
                    :title="g.highlight && isBest(row, e) ? 'Best in this row' : ''"
                  >{{ row[2](row[1](resultOf(e))) }}</TableCell>
                </TableRow>
              </template>
              <!-- View: show that result in full below -->
              <TableRow class="hover:bg-transparent">
                <TableCell />
                <TableCell v-for="e in compared" :key="e.key" class="pt-4 text-right" :class="entry === e && 'bg-primary/5'">
                  <Button size="sm" :variant="entry === e ? 'selected' : 'outline'" :aria-pressed="entry === e" @click="openResult(e)">{{ entry === e ? 'Viewing' : 'View' }}</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- Detail: one result, with the toggles -->
    <template v-if="ui.tab === 'result' && res">
      <!-- Everything this result was run with, and the whole result as JSON -->
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0 pb-4">
          <div class="space-y-1.5">
            <CardTitle class="text-xl">Run settings</CardTitle>
            <CardDescription>Everything this result was run with, as it was when you pressed Run on {{ when(entry.at) }}.</CardDescription>
          </div>
          <Button variant="outline" size="sm" class="w-[5.5rem]" title="Download everything about this result as JSON: run settings, every figure in both units, yearly and monthly rows, drawdowns and transactions" aria-label="Download this result as JSON" @click="exportResult"><Download class="h-4 w-4 mr-1.5" />JSON</Button>
        </CardHeader>
        <CardContent>
          <p v-if="!settings" class="text-sm text-muted-foreground">This run was saved before its settings were recorded. Run it again to see them here.</p>
          <div v-else class="grid gap-6 md:grid-cols-2 xl:grid-cols-[1.8fr_1fr_1fr] text-sm [&>*]:min-w-0">
            <!-- Assets: what each asset used and how much of the portfolio it was, then the reference series -->
            <section class="md:col-span-2 xl:col-span-1">
              <div class="mb-2 flex items-baseline justify-between gap-3">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assets</h4>
                <span class="font-mono text-xs text-muted-foreground" title="The run's period">{{ entry.period.from }} → {{ entry.period.to }}</span>
              </div>
              <!-- Asset | weight | series -->
              <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1">
                <template v-for="a in assetRows" :key="a.name">
                  <span class="truncate" :title="a.name">{{ a.name }}</span>
                  <span class="text-right tabular-nums">{{ a.weight === null ? '—' : `${a.weight}%` }}</span>
                  <span class="text-right text-muted-foreground">{{ a.series }}</span>
                </template>
                <template v-for="x in settings.reference" :key="'r' + x.asset">
                  <span class="text-muted-foreground" :class="x === settings.reference[0] && 'mt-2'">{{ x.asset }}</span>
                  <span :class="x === settings.reference[0] && 'mt-2'" />
                  <span class="text-right text-muted-foreground" :class="x === settings.reference[0] && 'mt-2'">{{ x.series }}</span>
                </template>
              </div>
            </section>
            <section>
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Investments</h4>
              <dl class="space-y-1">
                <div v-for="[k, v] in planSummary" :key="k" class="flex justify-between gap-3"><dt class="text-muted-foreground">{{ k }}</dt><dd class="text-right tabular-nums">{{ v }}</dd></div>
                <template v-if="!planSummary">
                  <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Lumpsum</dt><dd>{{ settings.investments.lumpsum }}</dd></div>
                  <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Monthly</dt><dd>{{ settings.investments.monthly }}</dd></div>
                  <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Yearly hike</dt><dd>{{ settings.investments.hike }}</dd></div>
                </template>
                <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Investment day</dt><dd>{{ settings.investments.investDay }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Contributions</dt><dd class="font-mono text-xs">{{ settings.investments.startMonth }} → {{ settings.investments.endMonth }}</dd></div>
                <!-- What the tax figures assume; the mock does not ask for it yet -->
                <div class="flex justify-between gap-3" title="Long-term capital gains on lots held over a year; what the tax figures in Returns and risks assume"><dt class="text-muted-foreground">Tax on gains</dt><dd>12.5% LTCG, assumed</dd></div>
              </dl>
            </section>
            <section>
              <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rebalancing</h4>
              <div class="mb-1 font-medium">{{ strategyName(settings.strategy.id) }}</div>
              <dl class="space-y-1">
                <div v-for="[k, v, sub] in strategyRows" :key="k" class="flex justify-between gap-3" :class="sub && 'pl-3'"><dt class="min-w-0 text-muted-foreground" :class="sub && 'truncate'" :title="sub ? k : ''">{{ k }}</dt><dd class="shrink-0 text-right tabular-nums">{{ v }}</dd></div>
              </dl>
            </section>
          </div>
        </CardContent>
      </Card>

      <!-- Returns and risks, grouped as in the comparison. Chart: the waterfall from invested to post tax, and the returns.
           Table: every figure, compact: Overview, then Returns with Rebalancing under it, then Risks. -->
      <Card class="bg-card border-border shadow-sm">
        <!-- Every card's header: the title in a fixed-width column, then how to show it (Chart | Table, Monthly |
             Yearly) in the same place on every card; at the right end, what to show (the card's own switch) and
             the download button (PNG or CSV). -->
        <CardHeader class="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-start md:gap-6">
          <div class="space-y-1.5 md:w-72 md:shrink-0">
            <CardTitle class="text-xl">Returns and risks</CardTitle>
            <CardDescription>What it came to, and at what risk.</CardDescription>
          </div>
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <Segmented v-model="outView" :options="['Chart', 'Table']" />
            <div class="ml-auto">
              <Button variant="outline" size="sm" class="w-[5.5rem]" :title="outView === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" :aria-label="outView === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" @click="exportOutput"><Download class="h-4 w-4 mr-1.5" />{{ outView === 'Chart' ? 'PNG' : 'CSV' }}</Button>
            </div>
          </div>
        </CardHeader>
        <!-- Both views are laid out in the same cell and the one not showing is hidden, so the card is always as
             tall as the taller of the two and switching never moves the page. -->
        <CardContent class="grid [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:min-w-0">
          <div ref="outChart" class="grid gap-x-8 gap-y-6 lg:grid-cols-[2fr_1fr] items-start [&>*]:min-w-0" :class="outView !== 'Chart' && 'invisible'" :aria-hidden="outView !== 'Chart'">
            <section>
              <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ output[0].title }}</h4>
              <WaterfallChart :steps="waterfall" />
            </section>
            <section>
              <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ output[1].title }}</h4>
              <ReturnsChart :rows="returnsBars" :real="today" />
            </section>
          </div>
          <div class="grid gap-x-8 gap-y-5 md:grid-cols-2 lg:grid-cols-3 items-start [&>*]:min-w-0" :class="outView !== 'Table' && 'invisible'" :aria-hidden="outView !== 'Table'">
            <!-- One table per column, the groups as heading rows, so the values in a column line up -->
            <Table v-for="(col, c) in [[0], [1, 3], [2]]" :key="c">
              <TableBody>
                <template v-for="(n, k) in col" :key="n">
                  <TableRow class="hover:bg-transparent">
                    <TableCell colspan="3" class="px-0 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground" :class="k ? 'pt-5' : 'pt-0'">{{ output[n].title }}</TableCell>
                  </TableRow>
                  <TableRow v-for="a in output[n].rows" :key="a.label" :title="a.title">
                    <TableCell class="px-2 py-1.5" :class="a.strong && 'font-semibold'">{{ a.label }}</TableCell>
                    <TableCell class="px-2 py-1.5 text-right tabular-nums whitespace-nowrap" :class="a.strong ? 'font-semibold' : 'font-medium'">{{ a.value }}</TableCell>
                    <TableCell v-if="col.some((m) => output[m].rows.some((x) => x.sub))" class="px-2 py-1.5 text-right text-xs text-muted-foreground">{{ a.sub }}</TableCell>
                  </TableRow>
                </template>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <!-- Each card below keeps one height whichever view shows (sized to the chart, at least 18rem), so a
           toggle never moves the page; a longer table scrolls inside it, and a chart shrinks to leave its legend
           room. -->

      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-start md:gap-6">
          <div class="space-y-1.5 md:w-72 md:shrink-0"><CardTitle class="text-xl">Investment and growth</CardTitle><CardDescription>{{ show === 'Growth' ? 'The portfolio against the money put in.' : 'What each asset bought and sold.' }}</CardDescription></div>
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <Segmented v-model="view" :options="['Chart', 'Table']" />
            <Segmented v-model="step" :options="['Yearly', 'Monthly']" />
            <div class="ml-auto flex flex-wrap items-center gap-2">
              <Segmented v-model="show" :options="['Growth', 'Transactions']" />
              <Button variant="outline" size="sm" class="w-[5.5rem]" :title="view === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" :aria-label="view === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" @click="exportGrowth"><Download class="h-4 w-4 mr-1.5" />{{ view === 'Chart' ? 'PNG' : 'CSV' }}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="relative min-h-72" style="aspect-ratio: 640 / 244">
            <div ref="igBox" class="absolute inset-0 flex flex-col overflow-auto">
              <template v-if="show === 'Growth' && view === 'Chart' && step === 'Monthly'">
                <FitChart v-slot="{ h }"><ValueChart :h="h" :value="valueLine" :invested="investedLine" :markers="res.rebalances" :start-year="START_YEAR" /></FitChart>
                <div class="flex shrink-0 flex-wrap gap-4 text-xs mt-2">
                  <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style="background:hsl(var(--chart-1))" />Portfolio value</span>
                  <span><i class="inline-block w-2.5 h-0.5 align-middle mr-1.5 bg-muted-foreground" />Invested</span>
                  <span v-if="res.rebalances.length"><i class="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style="background:hsl(var(--chart-3))" />Rebalance</span>
                </div>
              </template>
              <template v-else-if="show === 'Growth' && view === 'Chart'">
                <FitChart v-slot="{ h }"><GrowthChart :h="h" :rows="yearRows" /></FitChart>
                <div class="flex shrink-0 flex-wrap gap-4 text-xs mt-2">
                  <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 bg-muted-foreground/40" />Invested</span>
                  <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style="background:hsl(var(--chart-1))" />Growth</span>
                  <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 bg-status-critical/60" />Loss</span>
                </div>
              </template>
              <Table v-else-if="show === 'Growth'" container-class="h-full">
                <TableHeader class="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <TableHead>{{ step === 'Yearly' ? 'Year' : 'Month' }}</TableHead><TableHead class="text-right">Contribution</TableHead><TableHead class="text-right">Sold to rebalance</TableHead>
                    <TableHead class="text-right">Invested</TableHead><TableHead class="text-right">Growth</TableHead><TableHead class="text-right">Value</TableHead><TableHead class="text-right">Multiple</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="y in (step === 'Yearly' ? yearRows : monthRows)" :key="y.year ?? y.month">
                    <TableCell class="font-mono text-xs whitespace-nowrap">{{ y.year ?? y.month }}</TableCell>
                    <TableCell class="text-right tabular-nums">{{ inr(y.contribution) }}</TableCell>
                    <TableCell class="text-right tabular-nums" :class="!y.sold && 'text-muted-foreground'">{{ y.sold ? inr(y.sold) : '—' }}</TableCell>
                    <TableCell class="text-right tabular-nums">{{ inr(y.invested) }}</TableCell>
                    <TableCell class="text-right tabular-nums" :class="y.growth < 0 && 'text-status-critical-text'">{{ y.growth < 0 ? '−' : '' }}{{ inr(Math.abs(y.growth)) }}</TableCell>
                    <TableCell class="text-right tabular-nums">{{ inr(y.value) }}</TableCell>
                    <TableCell class="text-right tabular-nums text-muted-foreground">{{ times(y.value, y.invested) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <!-- Transactions: bought above the line, sold below, by asset -->
              <template v-else-if="view === 'Chart'">
                <FitChart v-slot="{ h }"><TxChart :h="h" :rows="txRows" /></FitChart>
                <div class="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
                  <span v-for="a in ASSETS" :key="a.name"><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</span>
                  <span class="text-muted-foreground">Above the line: bought · below: sold to rebalance</span>
                </div>
              </template>
              <Table v-else container-class="h-full">
                <TableHeader class="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow><TableHead>{{ step === 'Yearly' ? 'Year' : 'Month' }}</TableHead><TableHead>Asset</TableHead><TableHead class="text-right">Bought</TableHead><TableHead class="text-right">Sold</TableHead><TableHead class="text-right">Net</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <template v-for="r in txRows" :key="r.label">
                    <TableRow v-for="(a, k) in r.assets.filter((x) => x.bought || x.sold)" :key="r.label + a.name" :class="k === 0 && 'border-t-2'">
                      <TableCell class="font-mono text-xs whitespace-nowrap">{{ k === 0 ? r.label : '' }}</TableCell>
                      <TableCell><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</TableCell>
                      <TableCell class="text-right tabular-nums">{{ inr(a.bought) }}</TableCell>
                      <TableCell class="text-right tabular-nums" :class="a.sold ? 'text-status-critical-text' : 'text-muted-foreground'">{{ a.sold ? `−${inr(a.sold)}` : '—' }}</TableCell>
                      <TableCell class="text-right tabular-nums" :class="a.bought < a.sold && 'text-status-critical-text'">{{ a.bought < a.sold ? '−' : '' }}{{ inr(Math.abs(a.bought - a.sold)) }}</TableCell>
                    </TableRow>
                  </template>
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-start md:gap-6">
          <div class="space-y-1.5 md:w-72 md:shrink-0"><CardTitle class="text-xl">Allocation and drift</CardTitle><CardDescription title="The same in either unit">Each asset's share, or drift from target.</CardDescription></div>
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <Segmented v-model="allocView" :options="['Chart', 'Table']" />
            <Segmented v-model="allocStep" :options="['Yearly', 'Monthly']" />
            <div class="ml-auto flex flex-wrap items-center gap-2">
              <Segmented v-model="allocShow" :options="['Allocation', 'Drift']" />
              <Button variant="outline" size="sm" class="w-[5.5rem]" :title="allocView === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" :aria-label="allocView === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" @click="exportAllocation"><Download class="h-4 w-4 mr-1.5" />{{ allocView === 'Chart' ? 'PNG' : 'CSV' }}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="relative min-h-72" style="aspect-ratio: 640 / 244">
            <div ref="alBox" class="absolute inset-0 flex flex-col overflow-auto">
              <template v-if="allocShow === 'Drift' && allocView === 'Chart'">
                <FitChart v-slot="{ h }"><DriftChart :h="h" :rows="driftRows" :start-year="START_YEAR" :step="allocStep === 'Monthly' ? 1 : 12" :limits="driftLimits" :hidden="driftHidden" :show-total="driftTotal" /></FitChart>
                <!-- The legend switches each line on and off -->
                <div class="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1 text-xs mt-2">
                  <button type="button" class="rounded px-1.5 py-0.5 font-medium hover:bg-muted" :class="!driftTotal && 'opacity-40 line-through'" :aria-pressed="driftTotal" @click="driftTotal = !driftTotal"><i class="inline-block w-3 h-0.5 align-middle mr-1.5 bg-foreground" />Total drift</button>
                  <button v-for="a in ASSETS" :key="a.name" type="button" class="rounded px-1.5 py-0.5 hover:bg-muted" :class="driftHidden.includes(a.name) && 'opacity-40 line-through'" :aria-pressed="!driftHidden.includes(a.name)" @click="toggleDrift(a.name)"><i class="inline-block w-3 h-0.5 align-middle mr-1.5" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</button>
                  <span class="mx-1 text-muted-foreground" data-export-skip>·</span>
                  <button type="button" data-export-skip class="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent" :disabled="driftOnlyTotal" @click="showDriftTotalOnly">Total only</button>
                  <button type="button" data-export-skip class="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent" :disabled="driftAll" @click="showDriftAll">Show all</button>
                </div>
              </template>
              <Table v-else-if="allocShow === 'Drift'" container-class="h-full">
                <TableHeader class="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <TableHead>{{ allocStep === 'Yearly' ? 'Year end' : 'Month' }}</TableHead>
                    <TableHead class="text-right whitespace-nowrap">Total drift</TableHead>
                    <TableHead v-for="a in ASSETS" :key="a.name" class="text-right whitespace-nowrap"><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="r in driftRows" :key="r.label">
                    <TableCell class="font-mono text-xs whitespace-nowrap">{{ r.label }}</TableCell>
                    <TableCell class="text-right tabular-nums font-semibold" :class="driftLimits.length && settings.strategy.id === 'perpetual' && r.total > driftLimits[0].value && 'text-status-critical-text'">{{ pct(r.total) }}</TableCell>
                    <TableCell v-for="(a, k) in ASSETS" :key="a.name" class="text-right tabular-nums" :class="Math.abs(r.drift[k]) < 0.0005 && 'text-muted-foreground'">{{ signed(r.drift[k]) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <template v-else-if="allocView === 'Chart'">
                <FitChart v-slot="{ h }"><AllocationChart :h="h" :points="allocRows.map((r) => r.w)" :start-year="START_YEAR" :step="allocStep === 'Monthly' ? 1 : 12" /></FitChart>
                <div class="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
                  <span v-for="a in ASSETS" :key="a.name"><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</span>
                </div>
              </template>
              <Table v-else container-class="h-full">
                <TableHeader class="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <TableHead>{{ allocStep === 'Yearly' ? 'Year end' : 'Month' }}</TableHead>
                    <TableHead v-for="a in ASSETS" :key="a.name" class="text-right whitespace-nowrap"><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow class="text-muted-foreground">
                    <TableCell>Target</TableCell>
                    <TableCell v-for="a in ASSETS" :key="a.name" class="text-right tabular-nums">{{ a.weight }}%</TableCell>
                  </TableRow>
                  <TableRow v-for="r in allocRows" :key="r.label">
                    <TableCell class="font-mono text-xs whitespace-nowrap">{{ r.label }}</TableCell>
                    <TableCell v-for="(a, k) in ASSETS" :key="a.name" class="text-right tabular-nums">{{ pct(r.w[k]) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Drawdown: the chart, or the largest drawdowns as a table -->
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-start md:gap-6">
          <div class="space-y-1.5 md:w-72 md:shrink-0"><CardTitle class="text-xl">Drawdown</CardTitle><CardDescription>How far below its last peak, time-weighted.</CardDescription></div>
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <Segmented v-model="ddView" :options="['Chart', 'Table']" />
            <div class="ml-auto">
              <Button variant="outline" size="sm" class="w-[5.5rem]" :title="ddView === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" :aria-label="ddView === 'Chart' ? 'Download the chart as PNG' : 'Download the table as CSV'" @click="exportDrawdown"><Download class="h-4 w-4 mr-1.5" />{{ ddView === 'Chart' ? 'PNG' : 'CSV' }}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="relative min-h-72" style="aspect-ratio: 640 / 244">
            <div ref="ddBox" class="absolute inset-0 flex flex-col overflow-auto">
              <FitChart v-if="ddView === 'Chart'" v-slot="{ h }"><DrawdownChart :h="h" :drawdown="today ? res.drawdownReal : res.drawdown" :start-year="START_YEAR" /></FitChart>
              <Table v-else container-class="h-full">
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Peak</TableHead><TableHead>Trough</TableHead><TableHead>Recovered</TableHead><TableHead class="text-right">Depth</TableHead><TableHead class="text-right">Peak → trough</TableHead><TableHead class="text-right">Recovery</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow v-for="(d, i) in episodes" :key="d.peak">
                    <TableCell>{{ i + 1 }}</TableCell>
                    <TableCell class="font-mono text-xs whitespace-nowrap">{{ monthOf(d.peak) }}</TableCell>
                    <TableCell class="font-mono text-xs whitespace-nowrap">{{ monthOf(d.trough) }}</TableCell>
                    <TableCell class="font-mono text-xs whitespace-nowrap">{{ d.recovered === null ? 'not yet' : monthOf(d.recovered) }}</TableCell>
                    <TableCell class="text-right tabular-nums">{{ pct(d.depth) }}</TableCell>
                    <TableCell class="text-right">{{ months(d.peak, d.trough) }}</TableCell>
                    <TableCell class="text-right">{{ months(d.trough, d.recovered) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <p class="text-xs text-muted-foreground">Backtests show how a plan would have done in the past, not how it will do. Not investment advice.</p>
  </div>
</template>
