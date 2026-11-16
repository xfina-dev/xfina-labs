<script setup>
// Series: where the whole job of getting a run's data happens, end to end.
//
// Named for what it holds. The Portfolio Engine's own first step is Assets --
// it picks which of these series each asset uses -- so the two no longer share
// a name. The old /portfolio-engine/datasets/ URL redirects here.
//
// Four phases on one screen, in the order the work actually goes:
//
//   Selection -- which datasets you want (the wizard)
//   Download  -- how to get each one, per publisher, with its limits and terms
//   Import    -- drop the files in; they are read, identified and checked
//   Manage    -- what this browser holds: coverage, checks, what is unaccounted for
//
// One stage renders at a time, and the bar across the top is both where you are
// and what is left. Arriving, the stage with outstanding work opens: downloading
// happens outside the browser, so a user nearly always returns mid-pipeline.
//
// The screen is built on one state, not two. A file records what it is when it
// arrives (imports.js), so a row here is one catalogue instrument and its state
// is read, never worked out by comparing names as the page draws. That is the
// point of the screen as much as the ergonomics: the picks and the imports used
// to live in different stores with no shared key, and reconciling them at
// display time is what produced a run of quiet, hard-to-see bugs.
//
// Nothing here is uploaded. Files are read in this tab by the same parsers
// Xfina uses, and kept in this browser's own storage.
import { computed, ref, watch } from 'vue';
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from 'xfina-ui';
// Its own entry point since xfina-ui 0.11.0: a site that mounts no explorer
// never resolves ECharts, so only the sites that use one install it.
import { SeriesExplorer, rowsFromCsv } from 'xfina-ui/series-explorer';
import { ArrowLeft, ChevronRight, ExternalLink, FolderOpen, HelpCircle, ShieldCheck, Trash2, Upload } from 'lucide-vue-next';
import AppShell from '@/components/AppShell.vue';
import ChooseAndGet from './ChooseAndGet.vue';
import { imported, importFiles, load as loadImports, removeFile, clearImports, assignDataset, fileIdsOf, datasetState, seriesRows } from './imports.js';
import { picks, load as loadPicks } from './picks.js';
import { findDataset } from './guide.js';
import { regionsWithAssets } from './catalogue.js';
import { DATA, REFERENCE, refreshPublished } from './reference.js';
import { tone } from './tone.js';

// What this browser already holds, read back before anything else: the whole
// screen draws from the metadata, without the engine being fetched at all.
loadImports();
loadPicks();

// --- Stages ------------------------------------------------------------------
// One stage at a time. The whole job is four of them and they are long -- a
// wizard, a list of site cards, a drop area, a table -- so stacking them made
// one scroll nobody could hold in their head. The bar across the top is both
// where you are and what is left: always visible, always clickable, because a
// wizard you cannot leave is worse than a long scroll.
const STAGES = [
  { id: 'selection', label: 'Selection' },
  { id: 'download', label: 'Download' },
  { id: 'import', label: 'Import' },
  { id: 'manage', label: 'Manage' },
];
const stage = ref('selection');
const go = (id) => { stage.value = id; window.scrollTo({ top: 0, behavior: 'smooth' }); };

// What each stage has outstanding, which is what the bar counts.
const selected = computed(() => Object.keys(picks.by));
const toGet = computed(() => selected.value.filter((id) => datasetState(id) !== 'held'));
const heldCount = computed(() => Object.values(imported.datasets).filter((v) => v === 'held').length);
const counts = computed(() => ({
  selection: selected.value.length ? `${selected.value.length} chosen` : null,
  download: toGet.value.length ? `${toGet.value.length} to get` : null,
  import: imported.unmatched.length ? `${imported.unmatched.length} unmatched` : null,
  manage: heldCount.value ? `${heldCount.value} held` : null,
}));

// Where to start. Downloading happens outside the browser, so a user almost
// always comes back mid-pipeline: landing them on the stage with work left is
// worth more here than anything else. Only until they click, though -- after
// that the stage is theirs.
const steered = ref(false);
watch([() => imported.loaded, () => picks.loaded], ([a, b]) => {
  if (!a || !b || steered.value) return;
  steered.value = true;
  if (!selected.value.length && !heldCount.value) stage.value = 'selection';
  else if (toGet.value.length) stage.value = 'download';
  else if (imported.unmatched.length) stage.value = 'import';
  else stage.value = 'manage';
}, { immediate: true });
// The reference series' own figures, live where they can be had (reference.js).
refreshPublished();

// --- Import ------------------------------------------------------------------
const fileInput = ref(null);
const folderInput = ref(null);
const lastImport = ref(null);
const dragging = ref(false);

// What a folder holds besides data. A publisher's download folder picks these
// up -- the notes you keep beside the files, whatever the OS leaves behind --
// and they are not failures to report, so they are passed over in silence and
// counted as skipped.
const NOT_DATA = /^(\.|~)|^(README|readme)[.\w]*$|\.(md|txt|json5|zip|gz|pdf|docx?|png|jpe?g|gif|webp|svg|html?)$/;
const isData = (file) => !NOT_DATA.test(file.name);

const onFiles = async (files) => {
  const all = [...(files || [])];
  if (!all.length) return;
  // A folder is one action, so what it came to is one line: what read, what was
  // already in, what was passed over, what would not read. A hundred rows of
  // detail is what the Manage stage is for.
  const data = all.filter(isData);
  const skipped = all.length - data.length;
  if (!data.length) { lastImport.value = { read: 0, already: 0, errors: [], skipped }; return; }
  const out = await importFiles(data);
  lastImport.value = { ...out, skipped };
};
const onPicked = async (event) => {
  // Copied out before the input is cleared: `files` is a live FileList, and
  // clearing the input empties it.
  const files = [...(event.target.files || [])];
  event.target.value = ''; // so the same file again still fires a change
  await onFiles(files);
};
const onDrop = async (event) => {
  dragging.value = false;
  await onFiles(event.dataTransfer?.files);
};
const tone_ = computed(() => {
  if (imported.busy) return 'border-border bg-muted/40';
  if (lastImport.value?.errors.length) return 'border-status-critical/50 bg-status-critical/10';
  if (lastImport.value?.read) return 'border-status-good/50 bg-status-good/10';
  return dragging.value ? 'border-primary bg-primary/5' : 'border-dashed border-border';
});

// --- Hold --------------------------------------------------------------------
// Every series this browser holds, as one row each, with the catalogue
// instrument it is. `dataset` is the catalogue's own id for an instrument --
// not the asset id from identity.js, which names an asset; one asset holds
// many instruments.
const CATALOGUE_NAME = (id) => findDataset(id)?.name ?? id;
const describe = (key, s) => ({
  key: `${key}|${s.key}`,
  series: s,
  // What the catalogue calls what these files are, where the files said so.
  instrument: s.dataset ? CATALOGUE_NAME(s.dataset) : null,
  answered: s.answered,
  // An answer the files argue with: an instrument has no values before it
  // existed, so a series starting earlier than the plan it was said to be is
  // evidence the answer is wrong. The answer still stands -- it is the user's
  // -- but saying nothing about it would be hiding what the dates show.
  argues: (() => {
    if (!s.answered || !s.dataset) return null;
    const inception = findDataset(s.dataset)?.inception;
    return inception && s.from && s.from < inception ? inception : null;
  })(),
  // Where the file cannot say which instrument it is, the candidates it could
  // be: the screen asks once, rather than leaving the row in a state with no
  // way out of it.
  couldBe: s.candidates?.map((id) => ({ id, name: CATALOGUE_NAME(id) })) ?? null,
  files: s.files,
  worst: s.files.some((f) => f.status === 'err') ? 'err' : s.files.some((f) => f.status === 'warn') ? 'warn' : 'ok',
});

// Grouped by region and asset, the way the Assets step groups the same
// catalogue (catalogue.js). It is the same information about the same things,
// and two shapes for it is what made this screen feel like a different app.
// Only what is held shows: the whole catalogue would be a page of empty rows.
const groups = computed(() => regionsWithAssets()
  .map((r) => ({
    ...r,
    assets: r.assets.filter((a) => a.series.length).map((a) => ({ ...a, held: a.series.map((s) => describe(a.key, s)) })),
  }))
  .filter((r) => r.assets.length));
const held = computed(() => groups.value.flatMap((r) => r.assets.flatMap((a) => a.held)));

const rows = computed(() => held.value.reduce((n, h) => n + h.files.length, 0));

// --- Browsing one series -----------------------------------------------------
// xfina-ui's explorer (xfina-dev/xfina-ui#15), given a `loader` rather than
// rows: a series here is parsed in the WASM module and its bytes are in
// IndexedDB, so it is read when somebody opens it and not before. Holding every
// series' rows for a screen that shows one at a time is what the stages were
// split to avoid.
const browsing = ref(null);
const LINES = [{ key: 'value', label: 'Value' }];
const loaderFor = (h) => async () => rowsFromCsv(await seriesRows(fileIdsOf(h.series)), LINES);
const browse = (h) => { browsing.value = browsing.value?.key === h.key ? null : h; };

const confirmClear = ref(false);
const clearStored = async () => { confirmClear.value = false; await clearImports(); lastImport.value = null; };
const mb = (bytes) => (bytes == null ? '—' : bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
// Answering "which one is this?" for a series: the answer is kept against its
// files, so it is asked once and survives a reload (imports.js).
const answering = ref(null);
const answer = async (h, datasetId) => {
  answering.value = null;
  await assignDataset(h.files.map((f) => f.id), datasetId);
};
const forget = (h) => assignDataset(h.files.map((f) => f.id), null);
const STATUS = { ok: ['good', 'Valid'], warn: ['warn', 'Check'], err: ['critical', 'Invalid'] };
</script>

<template>
  <AppShell tool="/portfolio-engine/">
    <template #tagline>
      Get the data a backtest needs, and keep it: choose the datasets, download them from the publishers
      themselves, import the files here.
    </template>

    <!-- The screen's own header: what this is, and the way back to the run it feeds. -->
    <div class="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div class="min-w-0 space-y-1">
        <h1 class="text-2xl font-semibold">Series</h1>
        <p class="text-sm text-muted-foreground">
          Choose what you need, download it from the publisher, import it here, and keep it. The Portfolio
          Engine reads what this holds.
        </p>
      </div>
      <a href="/portfolio-engine/" class="no-underline shrink-0">
        <Button variant="outline" size="lg"><ArrowLeft class="h-4 w-4 mr-2" />Portfolio Engine</Button>
      </a>
    </div>

    <!-- True of the whole screen, not of one stage, and the thing worth saying first on a page that reads
         your files. -->
    <!-- Where the data goes, before anything is picked -->
    <div class="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
      <div class="flex items-center gap-2 font-semibold"><ShieldCheck class="h-4 w-4" />Data you download stays with you</div>
      <ul class="list-disc pl-5 space-y-0.5 text-muted-foreground">
        <li>You download the data from each source in your browser, and use it in your browser.</li>
        <li>Xfina Labs and Portfolio Engine are a static website: there is no API or form that stores anything on a server, so Xfina never sees your data.</li>
        <li>Each source's own terms of use apply (the Terms link on its card). Xfina isn't affiliated with any of them.</li>
        <li>A few open, public series come with Portfolio Engine, so there is nothing to download for them: USD/INR and inflation (CPI).</li>
      </ul>
    </div>

    <!-- Where you are, and what is left. The stages run left to right in the order the work does, so it
         reads as a path rather than a set of tabs: the one you are on is filled, the rest are quiet, and a
         count appears only where a stage has something outstanding. -->
    <nav class="flex flex-wrap items-center gap-1" aria-label="Stages">
      <template v-for="(s, i) in STAGES" :key="s.id">
        <ChevronRight v-if="i" class="hidden h-4 w-4 shrink-0 text-muted-foreground/40 sm:block" />
        <button
          type="button"
          class="flex min-w-0 flex-1 basis-36 items-baseline gap-2 rounded-md border px-3 py-2 text-left transition-colors sm:flex-none sm:basis-auto"
          :class="stage === s.id
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'"
          :aria-current="stage === s.id ? 'step' : undefined" @click="go(s.id)"
        >
          <span class="text-sm font-medium">{{ s.label }}</span>
          <span
            v-if="counts[s.id]" class="shrink-0 rounded-full px-1.5 py-0.5 text-xs tabular-nums"
            :class="stage === s.id ? 'bg-primary-foreground/15' : 'bg-muted-foreground/15'"
          >{{ counts[s.id] }}</span>
        </button>
      </template>
    </nav>

    <!-- Selection: which datasets you want -->
    <ChooseAndGet v-if="stage === 'selection'" stage="selection" />

    <!-- Download: where each one comes from, and how -->
    <template v-else-if="stage === 'download'">
      <ChooseAndGet stage="download" />
      <!-- The one seam the app cannot close: it has no way to know a download happened. So it is handed
           over rather than guessed at. -->
      <Card class="bg-card border-border shadow-sm">
        <CardContent class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-6">
          <p class="min-w-0 flex-1 text-sm text-muted-foreground sm:text-right">
            Downloads land in your own Downloads folder — nothing here can see them. Bring them in when you have them.
          </p>
          <Button size="lg" class="w-44 shrink-0" @click="go('import')"><Upload class="h-4 w-4 mr-2" />Import</Button>
        </CardContent>
      </Card>
    </template>

    <!-- Import: the files, in the publisher's own format -->
    <Card v-else-if="stage === 'import'" class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Import</CardTitle>
        <CardDescription>Drop the files you downloaded, in the publisher's own format. They are identified, checked and kept.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div
          class="flex flex-col items-center gap-3 rounded-md border-2 px-4 py-8 text-center transition-colors" :class="tone_"
          @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"
        >
          <p v-if="imported.busy" class="text-sm">Reading your files…</p>
          <template v-else-if="lastImport">
            <p class="text-sm">
              <span v-if="lastImport.read">{{ lastImport.read }} file{{ lastImport.read > 1 ? 's' : '' }} read and kept in this browser.{{ ' ' }}</span>
              <span v-else-if="!lastImport.errors.length">Nothing new to read.</span>
              <span v-if="lastImport.already" class="text-muted-foreground">{{ lastImport.already }} already imported.{{ ' ' }}</span>
              <span v-if="lastImport.skipped" class="text-muted-foreground" title="Notes, archives and whatever the OS leaves behind: passed over, not failures">{{ lastImport.skipped }} skipped.</span>
            </p>
            <p v-if="lastImport.errors.length" class="text-sm text-status-critical-text">
              {{ lastImport.errors.length }} could not be read: {{ lastImport.errors[0].message }}
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">Drop files here, or pick a folder — a publisher's whole folder at once.</p>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <Button size="lg" :disabled="imported.busy" @click="fileInput.click()"><Upload class="h-4 w-4 mr-2" />Choose files</Button>
            <!-- A folder, read right through: his data is already one folder per publisher, so this turns
                 ninety-seven files into one action. -->
            <Button variant="outline" size="lg" :disabled="imported.busy" @click="folderInput.click()"><FolderOpen class="h-4 w-4 mr-2" />Choose a folder</Button>
          </div>
          <input ref="fileInput" type="file" accept=".csv,.xls,.xlsx,.xlsm,.txt,.json" multiple class="sr-only" @change="onPicked" />
          <input ref="folderInput" type="file" webkitdirectory directory multiple class="sr-only" @change="onPicked" />
        </div>
        <p v-if="imported.storageError" class="text-xs text-status-critical-text">{{ imported.storageError }}</p>
      </CardContent>
    </Card>

    <!-- Manage: what this browser holds -->
    <Card v-else class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">What you hold</CardTitle>
        <CardDescription>
          <template v-if="held.length">{{ held.length }} dataset{{ held.length > 1 ? 's' : '' }} · {{ rows.toLocaleString('en-IN') }} file{{ rows > 1 ? 's' : '' }} in this browser.</template>
          <template v-else-if="imported.loaded">Nothing imported yet.</template>
          <template v-else>Reading what this browser holds…</template>
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <Table v-if="groups.length">
          <TableHeader>
            <TableRow>
              <TableHead>Series</TableHead><TableHead>Covers</TableHead>
              <TableHead class="text-right">Files</TableHead><TableHead>Checks</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="r in groups" :key="r.id">
              <!-- Region, then asset, as the Assets step reads -->
              <TableRow class="hover:bg-transparent">
                <TableCell colspan="5" class="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ r.title }}</TableCell>
              </TableRow>
              <template v-for="a in r.assets" :key="a.key">
                <TableRow class="bg-muted/30 hover:bg-muted/30">
                  <TableCell colspan="5" class="py-2 font-semibold">{{ a.name }}</TableCell>
                </TableRow>
                <template v-for="h in a.held" :key="h.key">
                  <TableRow>
                    <TableCell>
                      <div class="font-medium">{{ h.series.name }}</div>
                      <div v-if="h.instrument" class="text-xs text-muted-foreground">
                        {{ h.instrument }}
                        <button
                          v-if="h.answered" type="button" class="ml-1 underline decoration-dotted underline-offset-2 hover:text-foreground"
                          title="You chose this; ask me again" @click="forget(h)"
                        >your answer</button>
                      </div>
                      <div v-if="h.argues" class="text-xs text-status-warning-text">
                        These files start {{ h.series.from }}, before that plan existed ({{ h.argues }}) — so at least one of them is the other plan.
                      </div>
                      <!-- The file does not say which of these it is, so the screen asks, once -->
                      <div v-else-if="h.couldBe" class="space-y-1">
                        <div class="text-xs text-muted-foreground">The file names the scheme, not the plan. Which is it?</div>
                        <div class="flex flex-wrap gap-1.5">
                          <Button
                            v-for="c in h.couldBe" :key="c.id" size="sm" variant="outline" class="h-7 text-xs"
                            :title="`These files are ${c.name}`" @click="answer(h, c.id)"
                          >{{ c.name }}</Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell class="whitespace-nowrap font-mono text-xs">{{ h.series.from }} → {{ h.series.to }}</TableCell>
                    <TableCell class="text-right tabular-nums text-muted-foreground">{{ h.files.length }}</TableCell>
                    <TableCell><Badge :variant="tone(STATUS[h.worst][0])">{{ STATUS[h.worst][1] }}</Badge></TableCell>
                    <TableCell class="text-right whitespace-nowrap">
                      <Button
                        size="sm" :variant="browsing?.key === h.key ? 'secondary' : 'outline'"
                        :title="`Chart, calendar and values for ${h.series.name}, as a run reads it`" @click="browse(h)"
                      >{{ browsing?.key === h.key ? 'Close' : 'View' }}</Button>
                    </TableCell>
                  </TableRow>
                  <!-- Opened from the row above and drawn under it: the chart belongs beside the series it
                       is of. What it shows is the series as a run reads it -- the pieces stitched, the
                       publisher's adjusted twin preferred, a polled day reduced to its last reading -- and
                       the explorer is given a loader, so this is the only series ever parsed. -->
                  <TableRow v-if="browsing?.key === h.key" class="hover:bg-transparent">
                    <TableCell colspan="5" class="p-0">
                      <div class="border-y bg-muted/20 p-3">
                        <SeriesExplorer
                          :key="h.key" :loader="loaderFor(h)" :lines="LINES"
                          :unit="h.series.ccy === 'INR' ? '₹' : h.series.ccy === 'USD' ? '$' : ''"
                          :views="['chart', 'calendar', 'table']"
                          :first="h.series.from" :last="h.series.to"
                          :label="h.series.name"
                          :note="`${a.name} · ${h.files.length} file${h.files.length > 1 ? 's' : ''} · as a run reads it`"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                </template>
              </template>
            </template>
          </TableBody>
        </Table>

        <!-- Read, but nothing in the catalogue fits -->
        <div v-if="imported.unmatched.length" class="space-y-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-3">
          <div class="text-sm font-medium">{{ imported.unmatched.length }} file{{ imported.unmatched.length > 1 ? 's' : '' }} read, but not matched to an asset</div>
          <ul class="space-y-1">
            <li v-for="u in imported.unmatched" :key="u.id" class="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span class="font-mono break-all">{{ u.filename }}</span>
              <span class="text-muted-foreground">{{ u.publisher }}<template v-if="u.code"> · {{ u.code }}</template></span>
              <span v-if="u.ambiguous" class="basis-full text-muted-foreground">Could be {{ u.ambiguous.join(', or ') }} — they are different assets, so it is not filed under either.</span>
              <Button size="sm" variant="ghost" class="h-6 px-2 text-xs" @click="removeFile(u.id)">Remove</Button>
            </li>
          </ul>
        </div>

        <!-- Comes with the tool: nothing to choose here, and nothing to download. Which of each pair a run
             uses is a run decision, so it is picked in the engine's Series step, not here. -->
        <section class="space-y-2 border-t pt-4">
          <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comes with the tool</div>
          <p class="text-sm text-muted-foreground">
            Two series every run can call on, published by
            <a :href="DATA" target="_blank" rel="noopener" class="font-medium text-foreground underline underline-offset-4">Xfina Data</a>
            and fetched when a run needs them — nothing to download or import. Each comes in two versions: the
            one to prefer, and one with a longer history for runs that start further back. Which a run uses is
            picked with the run, in the engine's Series step, because it changes what the run reports.
          </p>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Series</TableHead><TableHead>Publisher</TableHead><TableHead>Covers</TableHead><TableHead>Why</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="a in REFERENCE" :key="a.key">
                <TableRow class="bg-muted/30 hover:bg-muted/30">
                  <TableCell colspan="4" class="py-2"><span class="font-semibold">{{ a.name }}</span> <span class="text-xs text-muted-foreground">{{ a.what }}</span></TableCell>
                </TableRow>
                <TableRow v-for="s in a.series" :key="s.id">
                  <TableCell class="whitespace-nowrap font-medium">{{ s.name }}</TableCell>
                  <TableCell class="text-sm">{{ s.publisher }}</TableCell>
                  <TableCell class="whitespace-nowrap font-mono text-xs">{{ s.first }} → {{ s.last }}</TableCell>
                  <TableCell class="text-xs text-muted-foreground">{{ s.note }}</TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </section>

        <!-- Kept in this browser, and where it is let go of -->
        <section v-if="imported.storage.files" class="space-y-2 border-t pt-4">
          <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stored in this browser</div>
          <div class="flex flex-wrap items-baseline gap-x-2">
            <span class="text-3xl font-semibold tabular-nums">{{ imported.storage.files }}</span><span class="text-sm">files</span>
            <span class="text-sm text-muted-foreground">{{ mb(imported.storage.stored) }}<template v-if="imported.storage.quota"> of about {{ mb(imported.storage.quota) }} this browser allows</template></span>
          </div>
          <p class="text-xs text-muted-foreground">
            Your imports stay here, so reloading changes nothing. They never leave this browser.
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

        <p class="text-xs text-muted-foreground">
          <a href="/portfolio-engine/" class="underline underline-offset-4 hover:text-foreground">Back to the Portfolio Engine<ExternalLink class="ml-1 inline h-3 w-3" /></a>
          to pick a series for each asset and run a backtest.
        </p>
      </CardContent>
    </Card>
  </AppShell>
</template>
