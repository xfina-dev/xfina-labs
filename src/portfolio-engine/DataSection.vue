<script setup>
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge,
} from 'xfina-ui';
import { tone } from './tone.js';
import { CLASSES, REGIONS, nodes } from './guide.js';
import { regionsWithAssets } from './catalogue.js';
import { DATA, REFERENCE, refreshPublished } from './reference.js';
import { reactive, computed, onMounted, watchEffect, toRef } from 'vue';
import { selection, ui, picks } from './store.js';
import { imported, seriesFor, fileIdsOf } from './imports.js';
import { Check } from 'lucide-vue-next';

// --- Series ----------------------------------------------------------------------------------------
// Every series on this page is real: an imported one is what `xfina` read from the files the user
// picked (see imports.js, which puts a dataset's pieces back together), and a provided one is a file
// Xfina Data publishes. A series says what its values are (basis) and whether they include income
// (ret), as the get-data page does. Series are kept apart, never merged: a run uses one per asset
// (see chosen).

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
const catalogue = regionsWithAssets().map((r) => ({ ...r, note: NOTES[r.id] }));

const sections = [
  ...catalogue,
  { id: 'provided', title: 'Reference', note: null, assets: REFERENCE }, // has a link, so the template writes it
];

// Xfina Data's live figures over the fallback (reference.js); on failure the fallback stands.
onMounted(refreshPublished);

// --- Which series a run uses -----------------------------------------------------------------------
// An imported series runs from..to; a provided one first..last, where a monthly series' month stands for
// its first day and its latest month is carried forward to the run's end.
const startOf = (s) => s.from ?? (s.frequency === 'monthly' ? `${s.first}-01` : s.first);
const endOf = (s) => s.to ?? s.last;
const shownStart = (s) => s.from ?? s.first;
const shownEnd = (s) => s.to ?? s.last;

// --- Files and their state -------------------------------------------------------------------------
// A series with an invalid file cannot be picked until the file is replaced or removed.
const invalid = (s) => s.origin !== 'provided' && s.files.some((f) => f.status === 'err');
// A series whose files read, but with something to look at: a gap, a cross-check that did not reconcile, a
// move worth a second glance. It can be used, and a run that uses it is as sound as the user's judgement of
// that note -- so it is not offered by default and is never picked automatically. Including one is a
// deliberate act, taken after reading what the note says.
const warned = (s) => s.origin !== 'provided' && !invalid(s) && s.files.some((f) => f.status === 'warn');
// What a run may pick on its own: read, checked, nothing to weigh up.
const clean = (s) => !invalid(s) && !warned(s);
// A series with something to check is not offered here at all: this step picks among series that are ready,
// and what to make of a check is the Series screen's business, where the notes themselves are. One can still
// be used -- its Use button there picks it for its asset -- and a series picked that way is listed here,
// because a run must never read a series the table does not show.
const listed = (a) => a.series.filter((x) => !warned(x) || picked[a.key] === x.key);
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
// A pick of the user's own stands whatever its checks say; nothing else reaches past a warning.
const unpicked = (a) => picked[a.key] === null;
const assetsOf = (provided) => sections.flatMap((x) => x.assets).filter((a) => !!a.provided === provided);
const BASE = computed(() => overlap(assetsOf(false).filter((a) => !unpicked(a)).map((a) => own(a) || a.series.find(clean)).filter(Boolean)));
// A reference asset the user has not chosen for takes the series that covers what the imported picks share.
// When none of them reaches that far back -- an index with a century of history, against a rate sheet that
// starts in 2020 -- it takes the one with the longest history rather than the first in the list, which is the
// shortest. Picking the shortest would quietly cut a hundred-year run down to six.
const longest = (a) => [...a.series].sort((x, y) => String(startOf(x)).localeCompare(String(startOf(y))))[0];
// Which reference series to convert with, or to deflate by, changes what a run reports, and the right one
// depends on how far back the run goes: SBI's sheets and MoSPI's index are the ones to prefer, and neither
// reaches as far as its alternative. So where a run starts before the preferred series covers, say so here,
// at the point of choosing. Nothing switches on its own: the choice is the user's, and a line beats a number
// quietly taken from the wrong series.
const reach = (a) => {
  if (!a.provided || !BASE.value.ok) return null;
  const [preferred, ...rest] = a.series;
  if (!preferred || spans(BASE.value)(preferred)) return null;
  const further = rest.find(spans(BASE.value));
  const from = startOf(preferred);
  return {
    from,
    preferred: preferred.name,
    further: further?.name ?? null,
  };
};
const chosen = (a) => (unpicked(a) ? null : own(a) || (a.provided ? a.series.find(spans(BASE.value)) || longest(a) : a.series.find(clean)) || null);
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
// Whether the series picked for an asset reaches as far back as any of that asset's datasets does. Ticked, it
// says at a glance that no history is being left behind; unticked is the signal worth having -- the pick, or
// what has been imported for it, starts later than it could.
const atFullHistory = (a) => { const s = chosen(a); return !!s && startOf(s) <= sinceOf(a); };
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

const rows = computed(() => current.value.assets.flatMap((a) => [
  { kind: 'asset', key: `a:${a.key}`, a },
  ...listed(a).map((s) => ({ kind: 'series', key: `r:${a.key}:${s.name}`, a, s })),
  ...(listed(a).length ? [] : [{ kind: 'empty', key: `e:${a.key}`, a }]),
]));

</script>

<template>
  <!-- Two columns, as in the other steps: the series each asset uses on the left, the run they make on the right -->
  <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start [&>*]:min-w-0">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Assets</CardTitle>
        <CardDescription>One loaded series per asset: what this run reads.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex gap-1 border-b overflow-x-auto overflow-y-hidden" role="tablist">
          <button
            v-for="t in regions" :key="t.id" type="button" role="tab" :aria-selected="region === t.id"
            class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
            :class="region === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
            @click="region = t.id"
          >{{ t.title }} <span class="ml-1 text-xs font-normal text-muted-foreground" :title="`${ready(t)} of ${t.assets.length} assets used in this run`">{{ ready(t) }}/{{ t.assets.length }}</span></button>
        </div>
        <p v-if="current.note" class="text-sm text-muted-foreground">{{ current.note }}</p>
        <p v-else class="text-sm text-muted-foreground">Loaded for you from <a :href="DATA" target="_blank" rel="noopener" class="font-medium text-foreground underline underline-offset-4 hover:decoration-2">Xfina Data</a>: USD/INR turns US and global assets into rupees, and inflation shows results in today's rupees.</p>

        <!-- Four columns: the pick, the series (a price-only one is tagged), its type, and the range it
             covers. Type sets the basis -- an index level, a market price or a NAV. Narrower than the
             minimum, the table scrolls. -->
        <Table class="table-fixed min-w-[28rem]">
          <colgroup><col class="w-9" /><col /><col class="w-[4.5rem]" /><col class="w-44" /></colgroup>
          <TableHeader>
            <TableRow>
              <TableHead class="pr-0"><span class="sr-only">Used for this run</span></TableHead>
              <TableHead>Series</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Range</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="r in rows" :key="r.key">
              <!-- Asset -->
              <TableRow v-if="r.kind === 'asset'" class="bg-muted/30 hover:bg-muted/30">
                <TableCell colspan="4" class="py-2">
                  <div class="flex items-baseline justify-between gap-4">
                    <span class="font-semibold">{{ r.a.name }}</span>
                    <span class="shrink-0 text-xs text-muted-foreground" :title="atFullHistory(r.a) ? `The series picked reaches as far back as any of this asset's datasets: ${sinceOf(r.a)}` : `The longest history any of this asset's datasets has: from ${sinceOf(r.a)}. The series picked starts later.`">
                      <Check v-if="atFullHistory(r.a)" class="mr-0.5 inline h-3 w-3 align-[-1px] text-status-good-text" />max <span class="font-semibold tabular-nums">{{ yearsSince(sinceOf(r.a)) }}</span> years
                    </span>
                  </div>
                  <p v-if="reach(r.a)" class="mt-0.5 text-xs text-status-warning-text">
                    Your run starts {{ RUN.from }}, before {{ reach(r.a).preferred }} covers ({{ reach(r.a).from }}).{{ ' ' }}<template v-if="reach(r.a).further">{{ reach(r.a).further }} goes back further.</template>
                  </p>
                </TableCell>
              </TableRow>

              <!-- Nothing loaded for this asset yet -->
              <TableRow v-else-if="r.kind === 'empty'" class="hover:bg-transparent">
                <TableCell />
                <TableCell colspan="3" class="text-muted-foreground">{{ !imported.loaded ? 'Reading your imports…' : imported.refreshing ? 'Checking your imports against this version…' : 'No series yet' }}</TableCell>
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
                    <Badge v-if="warned(r.s)" :variant="tone('warn')" class="shrink-0" title="Its files read, but something is worth checking: open it to read the notes before using it">Check</Badge>
                    <Badge v-if="r.s.ret && r.s.ret !== 'Total return'" :variant="tone('warn')" class="shrink-0" title="Price only: income is not included, so returns are understated">Price only</Badge>
                  </div>
                </TableCell>
                <TableCell class="whitespace-nowrap"><Badge :variant="tone(r.s.type === 'ETF' || r.s.type === 'MF' ? 'warn' : 'default')" :title="r.s.basis">{{ r.s.type }}</Badge></TableCell>
                <!-- What it covers, on one line. The ends are marked where they set the run: the latest start
                     among the picked series, and the earliest end. -->
                <TableCell class="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  <span :class="RUN.first === r.s && 'font-semibold text-foreground'" :title="RUN.first === r.s ? 'The run starts here: the latest start among the picked series' : ''">{{ shownStart(r.s) }}</span>
                  <span class="px-1">→</span>
                  <span :class="RUN.last === r.s && 'font-semibold text-foreground'" :title="RUN.last === r.s ? 'The run ends here: the earliest end among the picked series' : endsEarly(r.s) ? 'Ends before the data\'s end' : ''">{{ shownEnd(r.s) }}</span>
                </TableCell>
              </TableRow>

            </template>
          </TableBody>
        </Table>

        <!-- The one thing this step cannot otherwise show: files that read but belong to no asset here, so they
             are in none of the rows above. Fixing them is the Series screen's job; saying so is this one's. -->
        <p v-if="imported.unmatched.length" class="text-xs text-status-warning-text">
          {{ imported.unmatched.length }} imported file{{ imported.unmatched.length > 1 ? 's' : '' }} matched no asset, so {{ imported.unmatched.length > 1 ? 'they are' : 'it is' }} in none of these rows.
        </p>
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

        </section>
        <p class="text-xs text-muted-foreground">
          The first valid series is picked by default; click a picked one again to leave its asset out of the run. A series with an invalid file (red) can't be picked until it's fixed. Files are read and checked in your browser; nothing leaves it.
        </p>

      </CardContent>
    </Card>
  </div>

</template>
