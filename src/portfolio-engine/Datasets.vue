<script setup>
// Datasets: where the whole job of getting data happens, end to end.
//
// Four phases on one screen, in the order the work actually goes:
//
//   Choose  -- which datasets you want (the wizard; moves here next)
//   Get     -- how to download them, per site (moves here next)
//   Import  -- drop the files in; they are read, identified and checked
//   Hold    -- what this browser holds: coverage, checks, what is unaccounted for
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
import { computed, ref } from 'vue';
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from 'xfina-ui';
import { ExternalLink, HelpCircle, Trash2, Upload } from 'lucide-vue-next';
import AppShell from '@/components/AppShell.vue';
import { imported, importFiles, load as loadImports, removeFile, clearImports, assignDataset, fileIdsOf } from './imports.js';
import { findDataset, nodes } from './guide.js';
import { tone } from './tone.js';

// What this browser already holds, read back before anything else: the whole
// screen draws from the metadata, without the engine being fetched at all.
loadImports();

// --- Import ------------------------------------------------------------------
const fileInput = ref(null);
const lastImport = ref(null);
const dragging = ref(false);
const onFiles = async (files) => {
  const list = [...(files || [])];
  if (!list.length) return;
  lastImport.value = await importFiles(list);
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
const ASSET_OF = Object.fromEntries(nodes.map((n) => [`${n.region}|${n.class}|${n.asset}`, n]));
const held = computed(() => Object.entries(imported.byAsset).flatMap(([key, list]) => list.map((s) => ({
  key: `${key}|${s.key}`,
  series: s,
  asset: ASSET_OF[key]?.asset ?? key,
  region: ASSET_OF[key]?.region ?? '',
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
}))).sort((a, b) => a.region.localeCompare(b.region) || a.asset.localeCompare(b.asset)));
const rows = computed(() => held.value.reduce((n, h) => n + h.files.length, 0));

const confirmClear = ref(false);
const clearStored = async () => { confirmClear.value = false; await clearImports(); lastImport.value = null; };
const mb = (bytes) => (bytes == null ? '—' : bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
const detail = ref(null);
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
      themselves, import the files here.<br />
      Everything is read in this tab and kept in this browser. Nothing is uploaded.
    </template>

    <!-- Choose and Get live in How to get data until they move here -->
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="flex flex-col gap-3 space-y-0 pb-4 md:flex-row md:items-start md:justify-between">
        <div class="space-y-1.5">
          <CardTitle class="text-xl">Choose and get</CardTitle>
          <CardDescription>Which datasets you want, and how to download each one from its publisher.</CardDescription>
        </div>
        <a href="/portfolio-engine/get-data/" class="no-underline shrink-0">
          <Button variant="outline"><HelpCircle class="h-4 w-4 mr-2" />How to get data</Button>
        </a>
      </CardHeader>
    </Card>

    <!-- Import -->
    <Card class="bg-card border-border shadow-sm">
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
              <span v-if="lastImport.read">{{ lastImport.read }} file{{ lastImport.read > 1 ? 's' : '' }} read and kept in this browser.</span>
              <span v-if="lastImport.already" class="text-muted-foreground"> {{ lastImport.already }} already imported.</span>
            </p>
            <p v-if="lastImport.errors.length" class="text-sm text-status-critical-text">
              {{ lastImport.errors.length }} could not be read: {{ lastImport.errors[0].message }}
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">Drop files here, or pick them.</p>
          <Button size="lg" :disabled="imported.busy" @click="fileInput.click()"><Upload class="h-4 w-4 mr-2" />Choose files</Button>
          <input ref="fileInput" type="file" accept=".csv,.xls,.xlsx,.xlsm,.txt,.json" multiple class="sr-only" @change="onPicked" />
        </div>
        <p v-if="imported.storageError" class="text-xs text-status-critical-text">{{ imported.storageError }}</p>
      </CardContent>
    </Card>

    <!-- Hold -->
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">What you hold</CardTitle>
        <CardDescription>
          <template v-if="held.length">{{ held.length }} dataset{{ held.length > 1 ? 's' : '' }} · {{ rows.toLocaleString('en-IN') }} file{{ rows > 1 ? 's' : '' }} in this browser.</template>
          <template v-else-if="imported.loaded">Nothing imported yet.</template>
          <template v-else>Reading what this browser holds…</template>
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <Table v-if="held.length">
          <TableHeader>
            <TableRow>
              <TableHead>Dataset</TableHead><TableHead>Asset</TableHead><TableHead>Covers</TableHead>
              <TableHead class="text-right">Files</TableHead><TableHead>Checks</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="h in held" :key="h.key">
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
              <TableCell class="whitespace-nowrap text-sm">{{ h.region }} · {{ h.asset }}</TableCell>
              <TableCell class="whitespace-nowrap font-mono text-xs">{{ h.series.from }} → {{ h.series.to }}</TableCell>
              <TableCell class="text-right tabular-nums">
                <button type="button" class="rounded-md px-1.5 py-0.5 hover:bg-muted" :title="`Details for each file of ${h.series.name}`" @click="detail = h">{{ h.files.length }}</button>
              </TableCell>
              <TableCell><Badge :variant="tone(STATUS[h.worst][0])">{{ STATUS[h.worst][1] }}</Badge></TableCell>
              <TableCell class="text-right">
                <a href="/portfolio-engine/" class="text-sm underline decoration-dotted underline-offset-4 hover:text-foreground" title="Use it in a backtest">Use</a>
              </TableCell>
            </TableRow>
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
