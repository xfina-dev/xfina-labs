<script setup>
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge,
  Dialog, DialogScrollContent, DialogDescription, DialogHeader, DialogTitle,
} from 'xfina-ui';
import { tone } from './tone.js';
import { CLASSES, REGIONS, nodes, findDataset } from './guide.js';
import { ref, reactive, computed, onMounted, onBeforeUnmount, watchEffect, toRef } from 'vue';
import { selection, ui, picks } from './store.js';
import { nameFit } from './matching.js';
import { imported, seriesFor, fileIdsOf, removeFile, clearImports } from './imports.js';
import { Check, Download, Trash2, X } from 'lucide-vue-next';

// --- Series ----------------------------------------------------------------------------------------
// Every series on this page is real: an imported one is what `xfina` read from the files the user
// picked (see imports.js, which puts a dataset's pieces back together), and a provided one is a file
// Xfina Data publishes. A series says what its values are (basis) and whether they include income
// (ret), as the get-data page does. Series are kept apart, never merged: a run uses one per asset
// (see chosen).

// Xfina Data's published series, as its metadata.json described them on 2026-10-07. The page reads the
// live metadata.json on load (see onMounted) and keeps this copy if that fails.
const DATA = 'https://data.xfina.dev';
const PUBLISHED = {
  'sbi-forex-card-usd': { path: 'v1/fx/sbi-forex-card-usd.csv', frequency: 'daily', rows: 1593, first: '2020-01-06', last: '2026-10-06' },
  'bis-usd-inr': { path: 'v1/fx/bis-usd-inr.csv', frequency: 'daily', rows: 13610, first: '1973-01-02', last: '2026-09-29' },
  'in-cpi': { path: 'v1/inflation/in-cpi.csv', frequency: 'monthly', rows: 164, first: '2013-01', last: '2026-08' },
  'in-cpi-imf': { path: 'v1/inflation/in-cpi-imf.csv', frequency: 'monthly', rows: 835, first: '1957-01', last: '2026-07' },
};
const provided = (id, name, type, basis, note) => reactive({ id, key: `provided|${id}`, name, type, basis, ret: null, note, origin: 'provided', ...PUBLISHED[id] });

// The data's end: the latest date any imported series reaches, which is what the timeline and the
// "ends early" marks are measured against. With nothing imported yet there is no data, so today
// stands in and the timeline simply has nothing on it.
const today = new Date().toISOString().slice(0, 10);
const END = computed(() => {
  const ends = Object.values(imported.byAsset).flatMap((list) => list.map((s) => s.to)).filter(Boolean);
  return ends.sort().at(-1) || today;
});

// What each tab covers: where the underlying assets are, and the currency their series come in.
const NOTES = {
  india: 'Assets in India: indexes, ETFs and mutual funds, all in rupees.',
  us: 'Assets in the US: US indexes, US and Irish funds in dollars, plus Indian funds investing there, in rupees.',
  global: 'Assets across countries and currencies: world indexes, global bonds and gold, priced in dollars.',
};
const assetName = (cls, asset) => (cls === 'debt' ? `Debt · ${asset}` : asset);
const catalogue = REGIONS.map((r) => ({
  id: r.id, title: r.title, note: NOTES[r.id],
  assets: CLASSES.flatMap((c) => [...new Set(nodes.filter((n) => n.region === r.id && n.class === c.id).map((n) => n.asset))].map((asset) => ({
    key: `${r.id}|${c.id}|${asset}`,
    name: assetName(c.id, asset),
    since: nodes.filter((n) => n.region === r.id && n.class === c.id && n.asset === asset).flatMap((n) => n.instruments.map((i) => i.inception)).filter(Boolean).sort()[0],
    // Read through to the imported store, so a file imported above this step
    // shows up here without the catalogue being rebuilt.
    get series() { return seriesFor(`${r.id}|${c.id}|${asset}`); },
  }))),
}));

const sections = [
  ...catalogue,
  {
    id: 'provided', title: 'Reference', note: null, // has a link, so the template writes it
    assets: [
      { key: 'reference|fx', name: 'USD/INR', provided: true, series: [
        provided('sbi-forex-card-usd', 'SBI forex card', 'FX', 'TT rate', 'TT buy and TT sell: what SBI charges to convert between rupees and dollars on a forex card. Preferred: it is what a transfer actually costs.'),
        provided('bis-usd-inr', 'BIS USD/INR', 'FX', 'Reference rate', 'A reference rate from the Bank for International Settlements, rupees per dollar on each business day. The long history, for runs that start before SBI\'s sheets.'),
      ] },
      { key: 'reference|cpi', name: 'Inflation', provided: true, series: [
        provided('in-cpi', 'MoSPI CPI', 'CPI', 'Index level', 'India\'s official consumer price index, all-India combined, 2024 = 100. Preferred: MoSPI\'s own figures.'),
        provided('in-cpi-imf', 'IMF CPI', 'CPI', 'Index level', 'India\'s CPI as the IMF publishes it, on the same 2024 = 100 base. The long history, for runs that start before 2013.'),
      ] },
    ],
  },
];

// Xfina Data's live metadata.json (it allows any site to read it). On failure the copy above stays.
onMounted(async () => {
  try {
    const meta = await (await fetch(`${DATA}/v1/metadata.json`)).json();
    for (const d of meta.datasets || []) for (const a of sections.at(-1).assets) for (const s of a.series) if (s.id === d.id) Object.assign(s, { path: d.path, rows: d.rows, first: d.first, last: d.last });
  } catch { /* keep the copy */ }
});

// --- Which series a run uses -----------------------------------------------------------------------
// An imported series runs from..to; a provided one first..last, where a monthly series' month stands for
// its first day and its latest month is carried forward to the run's end.
const startOf = (s) => s.from ?? (s.frequency === 'monthly' ? `${s.first}-01` : s.first);
const endOf = (s) => s.to ?? s.last;
const shownStart = (s) => s.from ?? s.first;
const shownEnd = (s) => s.to ?? s.last;

// --- Files and their state -------------------------------------------------------------------------
const STATE = { ok: ['ok', 'Valid'], warn: ['warn', 'Warn'], err: ['err', 'Invalid'] };
// A series with an invalid file cannot be picked until the file is replaced or removed.
const invalid = (s) => s.origin !== 'provided' && s.files.some((f) => f.status === 'err');
const problem = (s) => s.files.find((f) => f.status === 'err')?.checks?.[0]?.[1] || 'a file failed its checks';

// The dates a set of series shares: the latest start to the earliest end. A monthly series' latest month
// is carried forward, so it never ends a run early.
function overlap(used) {
  const from = used.map(startOf).sort().at(-1), to = used.filter((s) => s.frequency !== 'monthly').map(endOf).sort()[0];
  // Picks can share no dates at all -- a fund whose history ended before another's began -- and then there is
  // no period, rather than one that runs backwards.
  const ok = !!from && !!to && from <= to;
  return { from, to, ok, first: used.find((s) => startOf(s) === from), last: used.find((s) => s.frequency !== 'monthly' && endOf(s) === to) };
}
const spans = (range) => (s) => startOf(s) <= range.from && (s.frequency === 'monthly' || endOf(s) >= range.to);

// The user picks the series each asset uses, or none: clicking the picked one again unpicks it, and the
// asset is left out of the run. Until the user touches an asset, an imported one uses its first valid
// series and a provided one the first that covers what the imported picks share.
// asset key (region|class|asset) → the key of the series it uses, or null for none. By key and not by
// position: the list is rebuilt on every import and on every visit, and a position means nothing across either.
const picked = picks;
const own = (a) => { const s = a.series.find((x) => x.key === picked[a.key]); return s && !invalid(s) ? s : null; };
const unpicked = (a) => picked[a.key] === null;
const assetsOf = (provided) => sections.flatMap((x) => x.assets).filter((a) => !!a.provided === provided);
const BASE = computed(() => overlap(assetsOf(false).filter((a) => !unpicked(a)).map((a) => own(a) || a.series.find((x) => !invalid(x))).filter(Boolean)));
// A reference asset the user has not chosen for takes the series that covers what the imported picks share.
// When none of them reaches that far back -- an index with a century of history, against a rate sheet that
// starts in 2020 -- it takes the one with the longest history rather than the first in the list, which is the
// shortest. Picking the shortest would quietly cut a hundred-year run down to six.
const longest = (a) => [...a.series].sort((x, y) => String(startOf(x)).localeCompare(String(startOf(y))))[0];
const chosen = (a) => (unpicked(a) ? null : own(a) || (a.provided ? a.series.find(spans(BASE.value)) || longest(a) : a.series.find((x) => !invalid(x))) || null);
const isChosen = (a, s) => chosen(a) === s;
// A reference asset (USD/INR, inflation) always has one series picked: every run needs it, so picking
// another switches to it, but the picked one cannot be cleared.
const choose = (a, s) => {
  if (invalid(s)) return;
  if (isChosen(a, s)) { if (!a.provided) picked[a.key] = null; } else picked[a.key] = s.key;
};

// The run covers the dates every picked series shares, provided ones included, so the shortest sets it.
const RUN = computed(() => overlap([...assetsOf(false), ...assetsOf(true)].map(chosen).filter(Boolean)));

// What a run records from this step: the series each asset uses, the reference series and the period.
// An imported pick carries the engine's handles for the files behind it and the currency they are
// quoted in; a provided one carries the published path the run fetches it from. The run reads those,
// and the results show the rest.
watchEffect(() => {
  const chosenIn = (provided) => sections.flatMap((x) => x.assets.filter((a) => !!a.provided === provided && chosen(a)).map((a) => {
    const s = chosen(a);
    return provided
      ? { tab: x.title, asset: a.name, series: s.name, type: s.type, id: s.id, path: s.path }
      : { tab: x.title, asset: a.name, series: s.name, type: s.type, files: fileIdsOf(s), ccy: s.ccy };
  }));
  selection.series = chosenIn(false);
  selection.reference = chosenIn(true);
  selection.period = RUN.value.ok ? { from: RUN.value.from, to: RUN.value.to } : { from: null, to: null };
});
const covers = (s) => spans(RUN.value)(s);
const tickTitle = (a, s) => {
  if (invalid(s)) return `Cannot be used: ${problem(s)}`;
  if (!isChosen(a, s)) return `Use ${s.name} for this run`;
  return a.provided ? 'Used for this run. Every run needs one; pick the other to switch' : 'Used for this run. Click again to leave this asset out';
};
const fileCount = (s) => (s.origin === 'provided' ? 1 : s.files.length);
const checksOf = (f) => f.checks || [['ok', `${f.rows.toLocaleString('en-IN')} rows, sorted, no duplicate dates, all values positive.`]];

// --- Table -----------------------------------------------------------------------------------------
// The table's tabs: the regions, and Reference (USD/INR and inflation, provided by Xfina Data). The one showing is
// shared, so How to get data (above the steps) opens at it.
const region = toRef(ui, 'region');
const regions = sections;
// A series that stops before the data's end shows where; one that runs to the end needs no end date.
const endsEarly = (x) => x.frequency !== 'monthly' && shownEnd(x) < END.value;
const current = computed(() => regions.find((s) => s.id === region.value));
const ready = (sec) => sec.assets.filter((a) => chosen(a)).length;
const importable = sections.filter((s) => s.id !== 'provided').flatMap((s) => s.assets);
// Data loaded is not the same as data used: an asset can have series and still be left out of this run.
const assetsWithData = computed(() => importable.filter((a) => a.series.length).length);
const assetsUsed = computed(() => importable.filter((a) => chosen(a)).length);
// The most history an asset can have: from its earliest dataset's start to the data's end.
// An imported asset's start comes from the catalogue; a reference asset's from its earliest series.
const sinceOf = (a) => a.since ?? a.series.map(startOf).sort()[0];
const yearsSince = (d) => ((new Date(END.value) - new Date(d)) / (365.25 * 864e5)).toFixed(1);
// The run period box's timeline: from the earliest start among the picked asset series (reference series are
// left out, their decades of history would squash the bar) to the data's end, with the run's window marked.
const TIMELINE = computed(() => {
  const used = importable.map(chosen).filter(Boolean);
  if (!used.length || !RUN.value.ok) return null;
  const lo = new Date(used.map(startOf).sort()[0]), hi = new Date(END.value), span = hi - lo;
  const at = (d) => Math.max(0, Math.min(100, ((new Date(d) - lo) / span) * 100));
  return { from: used.map(startOf).sort()[0], to: END.value, left: at(RUN.value.from), width: at(RUN.value.to) - at(RUN.value.from) };
});
const share = (n) => `${(n / importable.length) * 100}%`;
const runYears = computed(() => (RUN.value.ok ? ((new Date(RUN.value.to) - new Date(RUN.value.from)) / (365.25 * 864e5)).toFixed(1) : null));

// What was picked in How to get data (saved in this browser by that page: dataset id → source), shown under each
// asset as To download until its file is imported. Read again when this page comes back into view, so picks made
// in another tab show up. A pick whose dataset has since been imported drops off the list: its series is in the
// table above it, which is the row it was waiting to become.
const GUIDE_STORE = 'xfina_labs_guide_selection_v4';
const guidePicks = ref({});
const readGuide = () => { try { guidePicks.value = JSON.parse(localStorage.getItem(GUIDE_STORE) || '{}') || {}; } catch { guidePicks.value = {}; } };
onMounted(() => { readGuide(); addEventListener('focus', readGuide); addEventListener('storage', readGuide); });
onBeforeUnmount(() => { removeEventListener('focus', readGuide); removeEventListener('storage', readGuide); });
// Whether a picked dataset is already in: an imported series of that asset naming the same instrument. The
// comparison is matching.js's, the same one that decides which asset a file belongs to -- this used to be a
// second copy of it, and the copy went on failing on AMFI's shortened scheme names after the matcher stopped.
//
// A series carries no scheme code (AMFI prints none in the file), so where the name alone cannot tell two plans
// of one fund apart, two further things can: a fund has no NAVs before it existed, so a series starting before a
// dataset's inception is not that dataset; and if one file still fits two picked datasets, neither is claimed as
// held -- the row stays and says so, rather than telling him he has data he may not have.
function fitOf(dataset, s) {
  const fit = nameFit(s.name, dataset.name) || (s.code && dataset.code ? nameFit(s.code, dataset.code) : null);
  if (!fit) return null;
  if (dataset.inception && s.from && s.from < dataset.inception) return null;
  return fit;
}
// What is still to download for one asset: the picks no imported series settles.
function unheld(key, picks) {
  const series = seriesFor(key);
  const out = [];
  for (const d of picks) {
    let unsure = null;
    const held = series.some((s) => {
      const fit = fitOf(d, s);
      if (!fit) return false;
      if (fit === 'exact') return true;
      // The file names the scheme, not the plan. If it fits only this pick, it is this pick.
      const also = picks.filter((o) => o.id !== d.id && fitOf(o, s));
      if (!also.length) return true;
      unsure = also.map((o) => o.name);
      return false;
    });
    if (!held) out.push(unsure ? { ...d, unsure } : d);
  }
  return out;
}
const wanted = computed(() => {
  const byAsset = {};
  for (const [id, how] of Object.entries(guidePicks.value)) {
    const d = findDataset(id);
    if (d) (byAsset[`${d.region}|${d.cls}|${d.asset}`] ||= []).push({ ...d, how });
  }
  for (const [key, picks] of Object.entries(byAsset)) {
    const left = unheld(key, picks);
    if (left.length) byAsset[key] = left; else delete byAsset[key];
  }
  return byAsset;
});
const wantedOf = (a) => wanted.value[a.key] || [];
const wantedCount = computed(() => Object.values(wanted.value).reduce((n, w) => n + w.length, 0));
const wantedIn = (sec) => sec.assets.reduce((n, a) => n + wantedOf(a).length, 0);

const rows = computed(() => current.value.assets.flatMap((a) => [
  { kind: 'asset', key: `a:${a.key}`, a },
  ...a.series.map((s) => ({ kind: 'series', key: `r:${a.key}:${s.name}`, a, s })),
  ...wantedOf(a).map((d) => ({ kind: 'wanted', key: `w:${a.key}:${d.id}`, a, d })),
  ...(a.series.length || wantedOf(a).length ? [] : [{ kind: 'empty', key: `e:${a.key}`, a }]),
]));

const detail = ref(null);
const open = (a, s) => { detail.value = { a, s }; };
// Removing the last file of a series removes the series, so the dialog closes with it. The file goes from
// this browser too, not just from the table.
const forget = async (a, s, f) => {
  await removeFile(f.id);
  if (!seriesFor(a.key).some((x) => x.key === s.key)) detail.value = null;
};
// Clearing asks once, in place: it deletes every imported file from this browser.
const confirmClear = ref(false);
const clearStored = async () => { await clearImports(); confirmClear.value = false; };
const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

</script>

<template>
  <!-- Two columns, as in the other steps: the series each asset uses on the left, the run they make on the right -->
  <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start [&>*]:min-w-0">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Assets</CardTitle>
        <CardDescription>Pick the series each asset uses.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex gap-1 border-b overflow-x-auto overflow-y-hidden" role="tablist">
          <button
            v-for="t in regions" :key="t.id" type="button" role="tab" :aria-selected="region === t.id"
            class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
            :class="region === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
            @click="region = t.id"
          >{{ t.title }} <span class="ml-1 text-xs font-normal text-muted-foreground" :title="`${ready(t)} of ${t.assets.length} assets used in this run`">{{ ready(t) }}/{{ t.assets.length }}</span><Download v-if="wantedIn(t)" class="ml-1 inline h-3 w-3 text-muted-foreground" :title="`${wantedIn(t)} picked in How to get data, to download`" /></button>
        </div>
        <p v-if="current.note" class="text-sm text-muted-foreground">{{ current.note }}</p>
        <p v-else class="text-sm text-muted-foreground">Loaded for you from <a :href="DATA" target="_blank" rel="noopener" class="font-medium text-foreground underline underline-offset-4 hover:decoration-2">Xfina Data</a>: USD/INR turns US and global assets into rupees, and inflation shows results in today's rupees.</p>

        <!-- Five columns: the pick, the series (a price-only one is tagged), its type, where it starts (and ends,
             if before the data's end), and its files. Type sets the basis (an index level, a market price or a
             NAV), and the files' details hold the rest. Narrower than the minimum, the table scrolls. -->
        <Table class="table-fixed min-w-[28rem]">
          <colgroup><col class="w-9" /><col /><col class="w-[4.5rem]" /><col class="w-28" /><col class="w-16" /></colgroup>
          <TableHeader>
            <TableRow>
              <TableHead class="pr-0"><span class="sr-only">Used for this run</span></TableHead>
              <TableHead>Series</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Since</TableHead>
              <TableHead class="text-right">Files</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="r in rows" :key="r.key">
              <!-- Asset -->
              <TableRow v-if="r.kind === 'asset'" class="bg-muted/30 hover:bg-muted/30">
                <TableCell colspan="5" class="py-2">
                  <div class="flex items-baseline justify-between gap-4">
                    <span class="font-semibold">{{ r.a.name }}</span>
                    <span class="shrink-0 text-xs text-muted-foreground" :title="`The longest history any of this asset's datasets has: from ${sinceOf(r.a)}`">max <span class="font-semibold tabular-nums">{{ yearsSince(sinceOf(r.a)) }}</span> years</span>
                  </div>
                </TableCell>
              </TableRow>

              <!-- Nothing loaded for this asset yet -->
              <TableRow v-else-if="r.kind === 'empty'" class="hover:bg-transparent">
                <TableCell />
                <TableCell colspan="4" class="text-muted-foreground">{{ !imported.loaded ? 'Reading your imports…' : imported.refreshing ? 'Checking your imports against this version…' : 'No series yet' }}</TableCell>
              </TableRow>

              <!-- Series -->
              <TableRow v-else-if="r.kind === 'series'" :class="isChosen(r.a, r.s) && 'bg-primary/5 hover:bg-primary/10'">
                <TableCell class="pr-0" :title="tickTitle(r.a, r.s)">
                  <button
                    type="button" role="radio" :aria-checked="isChosen(r.a, r.s)" :aria-label="tickTitle(r.a, r.s)"
                    class="grid place-items-center h-5 w-5 rounded-full border transition-colors"
                    :disabled="invalid(r.s)"
                    :class="invalid(r.s) ? 'border-status-critical bg-status-critical/15 cursor-not-allowed' : isChosen(r.a, r.s) ? 'border-status-good bg-status-good text-background' : 'border-muted-foreground/40 hover:border-primary'"
                    @click="choose(r.a, r.s)"
                  ><Check v-if="isChosen(r.a, r.s)" class="h-3.5 w-3.5" /></button>
                </TableCell>
                <TableCell :class="isChosen(r.a, r.s) ? 'font-medium' : 'text-muted-foreground'">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate" :title="`${r.s.name} · ${r.s.basis}`">{{ r.s.name }}</span>
                    <Badge v-if="r.s.ret && r.s.ret !== 'Total return'" :variant="tone('warn')" class="shrink-0" title="Price only: income is not included, so returns are understated">Price only</Badge>
                  </div>
                </TableCell>
                <TableCell class="whitespace-nowrap"><Badge :variant="tone(r.s.type === 'ETF' || r.s.type === 'MF' ? 'warn' : 'default')" :title="r.s.basis">{{ r.s.type }}</Badge></TableCell>
                <TableCell class="whitespace-nowrap font-mono text-xs">
                  <div :class="RUN.first === r.s ? 'font-semibold text-foreground' : 'text-muted-foreground'" :title="RUN.first === r.s ? 'The run starts here: the latest start among the picked series' : ''">{{ shownStart(r.s) }}</div>
                  <div v-if="endsEarly(r.s)" :class="RUN.last === r.s ? 'font-semibold text-foreground' : 'text-muted-foreground'" :title="RUN.last === r.s ? 'The run ends here: the earliest end among the picked series' : 'Ends before the data\'s end'">to {{ shownEnd(r.s) }}</div>
                </TableCell>
                <TableCell class="text-right">
                  <button type="button" class="rounded-md px-1.5 py-0.5 -mr-1.5 hover:bg-muted" :title="`Details for each file of ${r.s.name}`" @click="open(r.a, r.s)">
                    <span class="text-sm tabular-nums underline decoration-dotted underline-offset-4">{{ fileCount(r.s) }}</span>
                  </button>
                </TableCell>
              </TableRow>

              <!-- Picked in How to get data, waiting for its file -->
              <TableRow v-if="r.kind === 'wanted'" class="hover:bg-transparent">
                <TableCell class="pr-0" title="Picked in How to get data: import its file to use it">
                  <span class="grid place-items-center h-5 w-5 rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"><Download class="h-3 w-3" /></span>
                </TableCell>
                <TableCell class="text-muted-foreground">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate" :title="r.d.name">{{ r.d.name }}</span>
                    <Badge variant="soon" class="shrink-0" :title="r.d.unsure ? 'A file of this fund is imported, but its name does not say which plan' : 'Picked in How to get data; not imported yet'">{{ r.d.unsure ? 'Which plan?' : 'To download' }}</Badge>
                  </div>
                  <div v-if="r.d.unsure" class="mt-0.5 text-xs">An imported file of this fund fits this and {{ r.d.unsure.join(', ') }}: AMFI's export names the scheme, not the plan, so it is not counted as either.</div>
                </TableCell>
                <TableCell class="whitespace-nowrap"><Badge :variant="tone(r.d.kind === 'ETF' || r.d.kind === 'MF' ? 'warn' : 'default')">{{ r.d.kind.toUpperCase() }}</Badge></TableCell>
                <TableCell class="whitespace-nowrap font-mono text-xs text-muted-foreground" :title="r.d.inception ? 'Its history starts here' : ''">{{ r.d.inception || '—' }}</TableCell>
                <TableCell class="text-right">
                  <a href="/portfolio-engine/get-data/#download" class="text-sm underline decoration-dotted underline-offset-4 hover:text-foreground" title="Where to download it, in How to get data">Get</a>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>

        <!-- Read, but not recognised as any asset in the catalogue. Listed rather than dropped: the file
             parsed, so what it holds is known, and saying so beats a silent nothing. -->
        <div v-if="imported.unmatched.length" class="space-y-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-3">
          <div class="text-sm font-medium">{{ imported.unmatched.length }} file{{ imported.unmatched.length > 1 ? 's' : '' }} read, but not matched to an asset</div>
          <ul class="space-y-1">
            <li v-for="u in imported.unmatched" :key="u.id" class="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span class="font-mono break-all">{{ u.filename }}</span>
              <span class="text-muted-foreground">{{ u.publisher }}<template v-if="u.code"> · {{ u.code }}</template><template v-if="u.from"> · {{ u.from }} → {{ u.to }} · {{ u.rows.toLocaleString('en-IN') }} rows</template></span>
              <span v-if="u.ambiguous" class="basis-full text-muted-foreground">Could be {{ u.ambiguous.join(', or ') }} — they are different assets, so the file is not filed under either. Rename it to the one you meant.</span>
            </li>
          </ul>
          <p class="text-xs text-muted-foreground">The file holds price history, but nothing in it names an instrument this catalogue lists. Check it is the dataset you meant, and that the publisher's own filename was kept.</p>
        </div>
      </CardContent>
    </Card>

    <!-- What the picks make: the run's period and the assets it uses -->
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Run</CardTitle>
        <CardDescription>The period your picks share, and the assets the run uses.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <section class="space-y-3">
          <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run period</div>
          <template v-if="RUN.ok">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-3xl font-semibold tabular-nums">{{ runYears }}</span><span class="text-sm">years</span>
              <span class="font-mono text-xs text-muted-foreground">{{ RUN.from }} → {{ RUN.to }}</span>
            </div>
            <!-- From the earliest picked start to the data's end; the filled part is the run -->
            <div v-if="TIMELINE" class="space-y-1">
              <div class="relative h-2 rounded-full bg-muted" role="img" :aria-label="`The run covers ${RUN.from} to ${RUN.to}`">
                <div class="absolute inset-y-0 rounded-full bg-primary" :style="{ left: `${TIMELINE.left}%`, width: `${TIMELINE.width}%` }" />
              </div>
              <div class="flex justify-between font-mono text-[10px] text-muted-foreground"><span>{{ TIMELINE.from }}</span><span>{{ TIMELINE.to }}</span></div>
            </div>
            <p class="text-xs text-muted-foreground" :title="RUN.last && RUN.last !== RUN.first && RUN.to < END ? `Ends with ${RUN.last.name}, ${RUN.to}` : ''">
              Limited by <span class="font-medium text-foreground">{{ RUN.first.name }}</span>, which starts {{ RUN.from }}. Nothing is extrapolated: a run uses only the dates every picked series covers.
            </p>
          </template>
          <p v-else-if="RUN.from && RUN.to" class="text-sm text-status-critical-text">
            Your picks share no dates: <span class="font-medium">{{ RUN.first?.name }}</span> starts {{ RUN.from }}, after <span class="font-medium">{{ RUN.last?.name }}</span> ends {{ RUN.to }}. Leave one of them out, or import more of its history.
          </p>
          <p v-else class="text-sm text-muted-foreground">Pick a series to set the run.</p>
        </section>

        <section class="space-y-3">
          <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assets</div>
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-3xl font-semibold tabular-nums">{{ assetsUsed }}</span><span class="text-sm">used</span>
            <span class="text-sm text-muted-foreground">of {{ assetsWithData }} loaded · {{ importable.length }} in all</span>
          </div>
          <!-- Used, loaded but not used, and not loaded, as shares of all the assets -->
          <div class="flex h-2 overflow-hidden rounded-full bg-muted" role="img" :aria-label="`${assetsUsed} used, ${assetsWithData} loaded, ${importable.length} in all`">
            <div class="h-full bg-status-good" :style="{ width: share(assetsUsed) }" />
            <div class="h-full bg-status-good/35" :style="{ width: share(assetsWithData - assetsUsed) }" />
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span><i class="mr-1.5 inline-block h-2 w-2 rounded-sm bg-status-good" />Used</span>
            <span><i class="mr-1.5 inline-block h-2 w-2 rounded-sm bg-status-good/35" />Loaded, not used</span>
            <span><i class="mr-1.5 inline-block h-2 w-2 rounded-sm bg-muted" />Not loaded</span>
          </div>
          <p v-if="wantedCount" class="text-xs text-muted-foreground"><Download class="mr-1 inline h-3 w-3" />{{ wantedCount }} dataset{{ wantedCount > 1 ? 's' : '' }} picked in <a href="/portfolio-engine/get-data/#download" class="underline underline-offset-4 hover:text-foreground">How to get data</a>, to download and import.</p>
        </section>
        <p class="text-xs text-muted-foreground">
          The first valid series is picked by default; click a picked one again to leave its asset out of the run. A series with an invalid file (red) can't be picked until it's fixed. Files are read and checked in your browser; nothing leaves it.
        </p>

        <!-- What this browser is holding. Imported files are kept here so a reload changes nothing; they are
             this browser's alone, and this is where they are let go of. -->
        <section v-if="imported.storage.files || imported.storageError" class="space-y-2 border-t pt-4">
          <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stored in this browser</div>
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-3xl font-semibold tabular-nums">{{ imported.storage.files }}</span><span class="text-sm">files</span>
            <span class="text-sm text-muted-foreground">{{ mb(imported.storage.stored) }}<template v-if="imported.storage.quota"> of about {{ mb(imported.storage.quota) }} this browser allows</template></span>
          </div>
          <p v-if="imported.storageError" class="text-xs text-status-critical-text">{{ imported.storageError }}</p>
          <p class="text-xs text-muted-foreground">
            Your imports stay here, so reloading the page changes nothing. They never leave this browser.
            <template v-if="!imported.persisted"> This browser may clear them if it runs short of space.</template>
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="confirmClear">
              <span class="text-sm">Delete all {{ imported.storage.files }} imported files?</span>
              <Button size="sm" variant="destructive" @click="clearStored">Delete</Button>
              <Button size="sm" variant="outline" @click="confirmClear = false">Cancel</Button>
            </template>
            <Button v-else size="sm" variant="outline" @click="confirmClear = true"><Trash2 class="h-4 w-4 mr-2" />Clear imported files</Button>
          </div>
        </section>


      </CardContent>
    </Card>
  </div>

  <!-- The files behind one series, each with its own checks -->
  <Dialog :open="!!detail" @update:open="(v) => { if (!v) detail = null; }">
    <DialogScrollContent v-if="detail" class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ detail.s.name }}</DialogTitle>
        <DialogDescription>
          {{ detail.a.name }} · {{ detail.s.type }} · {{ detail.s.ret || 'no returns' }} · {{ detail.s.basis }}<template v-if="detail.s.ccy"> · <span :title="detail.s.ccyAssumed ? 'The file does not say which currency it is in; this one comes from where the asset is. A series in dollars is converted with the USD/INR series before a run.' : 'The currency the file states'">{{ detail.s.ccy }}<template v-if="detail.s.ccyAssumed"> (assumed)</template></span></template>
          · {{ shownStart(detail.s) }} → {{ shownEnd(detail.s) }}
        </DialogDescription>
      </DialogHeader>

      <p class="text-sm">
        <template v-if="invalid(detail.s)">Cannot be used until the invalid file below is replaced or removed.</template>
        <template v-else-if="isChosen(detail.a, detail.s)">Used for this run, {{ RUN.from }} → {{ RUN.to }}.</template>
        <template v-else>Not used for this run. Pick it in the table to use it<template v-if="chosen(detail.a)"> instead of {{ chosen(detail.a).name }}</template>.</template>
      </p>

      <!-- Reference (provided by Xfina Data): one published file -->
      <div v-if="detail.s.origin === 'provided'" class="space-y-3 text-sm">
        <p class="text-muted-foreground">{{ detail.s.note }}</p>
        <div class="rounded-md border p-3 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <a :href="`${DATA}/${detail.s.path}`" target="_blank" rel="noopener" class="font-mono text-xs break-all text-foreground underline underline-offset-4 hover:decoration-2">{{ DATA.replace('https://', '') }}/{{ detail.s.path }}</a>
            <Badge :variant="tone('ok')">Valid</Badge>
          </div>
          <div class="font-mono text-xs text-muted-foreground">{{ detail.s.frequency }} · {{ detail.s.rows.toLocaleString('en-IN') }} rows · {{ detail.s.first }} → {{ detail.s.last }}</div>
          <div v-if="detail.s.frequency === 'monthly'" class="text-xs text-muted-foreground">Monthly: the latest month is carried forward to the run's end.</div>
        </div>
      </div>

      <!-- Imported: every file, with its checks -->
      <div v-else class="space-y-2">
        <div class="text-sm text-muted-foreground">
          {{ detail.s.files.length }} file{{ detail.s.files.length > 1 ? 's' : '' }} ·
          {{ detail.s.files.filter((f) => f.status !== 'err').reduce((n, f) => n + f.rows, 0).toLocaleString('en-IN') }} rows used
        </div>
        <ul class="divide-y rounded-md border">
          <li v-for="f in detail.s.files" :key="f.name" class="p-3 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs break-all" :class="f.status === 'err' && 'line-through text-muted-foreground'">{{ f.name }}</span>
              <Badge :variant="tone(STATE[f.status][0])">{{ STATE[f.status][1] }}</Badge>
              <!-- A file can be taken back out: an invalid one has to be, before its series can be used -->
              <button
                type="button" class="ml-auto grid place-items-center h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                :title="`Remove ${f.name} from this series`" @click="forget(detail.a, detail.s, f)"
              ><X class="h-3.5 w-3.5" /></button>
            </div>
            <div class="font-mono text-xs text-muted-foreground">{{ f.from }} → {{ f.to }}<template v-if="f.rows"> · {{ f.rows.toLocaleString('en-IN') }} rows</template></div>
            <ul class="space-y-1">
              <li v-for="(c, i) in checksOf(f)" :key="i" class="flex gap-2 text-xs">
                <span class="shrink-0 font-medium" :class="c[0] === 'err' ? 'text-status-critical-text' : c[0] === 'warn' ? 'text-status-warning-text' : 'text-status-good-text'">{{ c[0] === 'err' ? 'Invalid' : c[0] === 'warn' ? 'Warn' : 'OK' }}</span>
                <span class="text-muted-foreground">{{ c[1] }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </div>

    </DialogScrollContent>
  </Dialog>
</template>
