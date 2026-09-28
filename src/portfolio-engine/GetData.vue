<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { ArrowLeft, ExternalLink, X, Check } from 'lucide-vue-next';
import AppShell from '@/components/AppShell.vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Tag from './Tag.vue';
import GifPreview from './GifPreview.vue';
import { bookmarkletFor } from './bookmarklets.js';
import { CLASSES, REGIONS, VEHICLES, LISTINGS, HOW, vehiclesFor, listingsFor, groupsFor, findDataset, dateNote, dateSourceNote, yearsOf, distFlag } from './guide.js';

// The wizard: asset class → region → model as → (Irish or US ETFs, for US and Global ETFs only).
// Every asset for that path is then listed as a group with its oldest three. The path lives in the
// URL hash, e.g. #equity/us/etf/irish, so a link lands on the same step.
//
// Lanes 1 to 3 always hold a choice: Equity, India, Index unless the URL says otherwise. Changing an
// earlier lane keeps the later choice when it still exists and otherwise falls back to the first that does.
const cls = ref('equity');
const region = ref('india');
const vehicle = ref('index');
const listing = ref(null);

const vehicles = computed(() => vehiclesFor(cls.value, region.value));
const offers = (id) => vehicles.value.some((v) => v.id === id);
const listings = computed(() => listingsFor(cls.value, region.value, vehicle.value));
// The fourth lane has content only when there is something to choose: the ETF listing for US and Global ETFs, or the plan for mutual funds.
const showListing = computed(() => listings.value.length > 0);
const groups = computed(() => {
  const g = groupsFor(cls.value, region.value, vehicle.value, listing.value);
  // An index is named after its own asset ("Nifty 50" then "Nifty 50 TRI"), so a per-asset heading would just
  // repeat it: one flat list under a single "<Region> Index" heading instead, comparable to ETF/MF's per-asset one.
  return vehicle.value === 'index' ? (g.length ? [{ asset: `${regionTitle(region.value)} Index`, instruments: g.flatMap((x) => x.instruments) }] : []) : g;
});

// Bring the lanes back to a valid state after any change. Irish ETFs are the default listing.
function settle(wantListing = null) {
  if (!offers(vehicle.value)) vehicle.value = vehicles.value.find((v) => v.id === 'index')?.id || vehicles.value[0]?.id || vehicle.value;
  const ls = listingsFor(cls.value, region.value, vehicle.value);
  listing.value = ls.length ? (ls.some((x) => x.id === wantListing) ? wantListing : ls[0].id) : null;
}
const pick = (which, v) => {
  const keepListing = listing.value;
  if (which === 'cls') cls.value = v;
  if (which === 'region') region.value = v;
  if (which === 'vehicle') { vehicle.value = v; settle(); return; }
  if (which === 'listing') { listing.value = v; return; }
  settle(keepListing);
};
const toHash = () => [cls.value, region.value, vehicle.value, listing.value].filter(Boolean).join('/');
const fromHash = () => {
  const [c, r, v, l] = location.hash.slice(1).split('/');
  if (CLASSES.some((x) => x.id === c)) cls.value = c;
  if (REGIONS.some((x) => x.id === r)) region.value = r;
  if (VEHICLES.some((x) => x.id === v)) vehicle.value = v;
  settle(l);
};
watch([cls, region, vehicle, listing], () => { try { history.replaceState(null, '', `#${toHash()}`); } catch { /* ignore */ } });

// What the user added, by instrument id. Kept in this browser only.
const STORE = 'xfina_labs_guide_selection_v3';
const picked = ref([]);
const has = (id) => picked.value.includes(id);
const toggle = (id) => (picked.value = has(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]);
const list = computed(() => picked.value.map(findDataset).filter(Boolean));
// One row per asset (and region) inside each asset class, with what was picked under Index, ETF and MF.
const selectedRows = computed(() => CLASSES.map((cls) => {
  const rows = new Map();
  for (const i of list.value.filter((x) => x.cls === cls.id)) {
    const key = `${i.region}|${i.asset}`;
    if (!rows.has(key)) rows.set(key, { key, asset: i.asset, region: i.region, cells: { index: [], etf: [], mf: [] } });
    rows.get(key).cells[i.vehicle].push(i);
  }
  const order = (r) => REGIONS.findIndex((x) => x.id === r.region);
  return { cls, rows: [...rows.values()].sort((a, b) => order(a) - order(b)) };
}).filter((g) => g.rows.length));
const REGION_CODE = { india: 'IN', us: 'US', global: 'GL' };
const regionTitle = (id) => REGIONS.find((r) => r.id === id)?.title || id;

onMounted(() => {
  fromHash();
  window.addEventListener('hashchange', fromHash);
  try { picked.value = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { /* storage blocked: start empty */ }
});
watch(picked, (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* ignore */ } }, { deep: true });

// The download list is grouped by website, so each site is visited once. A page link that every
// dataset in the group shares (for example the NSE Indices historical data page) shows once at the
// top; links specific to one dataset (a ticker's own page) stay on its row.
//
// Sites are ordered Indian entities first, then Global (a site is "Indian" if any of its items is
// region 'india'; every source in practice serves one bucket only, never a mix), and within each,
// Index before ETF before MF (a site with mixed vehicles, only Yahoo Finance does this, sorts by the
// earliest vehicle it carries; its items are sorted the same way inside the group).
const VEHICLE_ORDER = { index: 0, etf: 1, mf: 2 };
const vehicleRank = (i) => VEHICLE_ORDER[i.vehicle] ?? 3;
const bySite = computed(() => {
  const m = new Map();
  for (const i of list.value) {
    const site = HOW[i.how].site;
    m.set(site, [...(m.get(site) || []), i]);
  }
  const groups = [...m.entries()].map(([site, its]) => {
    its = [...its].sort((a, b) => vehicleRank(a) - vehicleRank(b));
    const urls = new Map();
    for (const i of its) for (const l of i.links) urls.set(l.url, { l, n: (urls.get(l.url)?.n || 0) + 1 });
    const shared = its.length > 1 ? [...urls.values()].filter((u) => u.n === its.length).map((u) => u.l) : [];
    const sharedUrls = new Set(shared.map((l) => l.url));
    const hows = [...new Set(its.map((i) => i.how))].map((h) => HOW[h]);
    const region = its.some((i) => i.region === 'india') ? 0 : 1;
    const vehicle = Math.min(...its.map(vehicleRank));
    return { site, items: its, shared, sharedUrls, hows, bookmarklet: bookmarkletFor(site, its), region, vehicle };
  });
  return groups.sort((a, b) => a.region - b.region || a.vehicle - b.vehicle || a.site.localeCompare(b.site));
});

// Clicking a bookmarklet link on this page would run it here, where it does nothing useful. It is for dragging.
const dragHint = ref(false);
// Manual or assisted, per website. Assisted exists only where a bookmarklet does.
const modes = ref({});
const mode = (site) => modes.value[site] || 'manual';
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
// min-w-0 so a long blurb (e.g. Switzerland's) truncates inside its grid column instead of forcing
// the column, and the whole grid, wider than its container (a CSS Grid default: a child's intrinsic
// content width otherwise wins over the column's 1fr share).
const tile = (on) => ['w-full min-w-0 text-left rounded-md border p-3 transition-colors', on ? 'border-primary bg-primary/5' : 'hover:bg-muted'];
const clip = (t) => (t.length > 64 ? `${t.slice(0, 62)}…` : t);
</script>

<template>
  <AppShell tool="/portfolio-engine/">
    <template #tagline>
      Answer a few questions and get the exact page to download each dataset from.<br />
      Xfina reads the file as the source publishes it. Nothing is uploaded to any server.
    </template>

    <div>
      <a href="/portfolio-engine/" class="no-underline">
        <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4 mr-2" />Back to Portfolio Engine</Button>
      </a>
    </div>

    <!-- 1. Picker, full width -->
    <section id="select" class="space-y-4 scroll-mt-8">
      <div class="flex items-center gap-3">
        <span class="inline-grid place-items-center w-6 h-6 rounded-full bg-muted text-xs font-semibold">1</span>
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Select Datasets For Download</h2>
        <div class="h-px flex-1 bg-border" />
      </div>
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle>Find your data</CardTitle>
        <CardDescription>Pick as many datasets as you need. They collect below, grouped by website.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <section class="space-y-2">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">1</span>Asset class</h3>
            <div class="grid gap-2">
              <button v-for="c in CLASSES" :key="c.id" type="button" :class="tile(cls === c.id)" @click="pick('cls', c.id)">
                <div class="font-medium">{{ c.title }}</div><div class="text-xs text-muted-foreground truncate">{{ c.blurb }}</div>
              </button>
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">2</span>Region</h3>
            <div class="grid gap-2">
              <button v-for="r in REGIONS" :key="r.id" type="button" :class="tile(region === r.id)" @click="pick('region', r.id)">
                <div class="font-medium">{{ r.title }}</div><div class="text-xs text-muted-foreground truncate">{{ r.blurb }}</div>
              </button>
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">3</span>Model it as</h3>
            <div class="grid gap-2">
              <!-- Only the models that exist for this class and region; Gold has no Index, for example. -->
              <button v-for="v in vehicles" :key="v.id" type="button" :class="tile(vehicle === v.id)" @click="pick('vehicle', v.id)">
                <div class="font-medium">{{ v.title }}</div><div class="text-xs text-muted-foreground truncate">{{ v.blurb }}</div>
              </button>
            </div>
          </section>

          <!-- Lane 4 keeps its column so the picker never changes shape. Its content shows only for US and
               Global ETFs, where Irish ETFs are the default; otherwise the lane is simply empty. -->
          <section class="space-y-2">
            <template v-if="showListing">
              <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">4</span>{{ vehicle === 'mf' ? 'Which plan' : 'ETF Domicile' }}</h3>
              <div class="grid gap-2">
                <button v-for="l in listings" :key="l.id" type="button" :class="tile(listing === l.id)" @click="pick('listing', l.id)">
                  <div class="font-medium">{{ l.title }}</div><div class="text-xs text-muted-foreground truncate">{{ l.blurb }}</div>
                </button>
              </div>
            </template>
          </section>
        </div>

        <!-- Every asset for the path, grouped, each with its oldest three -->
        <section v-if="vehicle" class="space-y-4 border-t pt-6">
          <p v-if="!groups.length" class="text-sm text-muted-foreground">Nothing is listed for this yet.</p>
          <div v-else class="overflow-x-auto rounded-md border">
            <table class="w-full min-w-[760px] text-sm">
              <tbody v-for="g in groups" :key="g.asset || 'indexes'">
                <tr v-if="g.asset"><th colspan="8" class="border-t bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold">{{ g.asset }}</th></tr>
                <tr v-for="i in g.instruments" :key="i.id" class="border-t">
                  <td class="px-3 py-2 whitespace-nowrap"><Tag v-if="i.kind === 'Index'">INDEX</Tag><Tag v-else-if="i.code && i.code.length <= 10 && i.code !== i.name">{{ i.code }}</Tag></td>
                  <td class="px-3 py-2 min-w-0 whitespace-nowrap font-medium" :title="dateNote(i) + (dateSourceNote(i) ? ` (${dateSourceNote(i)})` : '')">{{ clip(i.name) }}</td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <Tag v-if="distFlag(i)" :variant="distFlag(i) === 'Acc' ? 'ok' : 'warn'" :title="distFlag(i) === 'Acc' ? 'Accumulating: income is reinvested (or, for an index, included in the level)' : 'Distributing: income is paid out, not reinvested (or, for an index, excluded from the level)'">{{ distFlag(i) }}</Tag>
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ HOW[i.how].site }}</td>
                  <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ i.ccy }}</td>
                  <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ i.returnType }}</td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <span v-if="yearsOf(i) !== null" title="Years of history, rounded down" class="text-sm font-medium text-primary">{{ yearsOf(i) < 1 ? '<1 yr' : `${yearsOf(i)} yr${yearsOf(i) > 1 ? 's' : ''}` }}</span>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <Button :variant="has(i.id) ? 'default' : 'outline'" size="sm" class="w-28 justify-center" @click="toggle(i.id)">
                      <Check v-if="has(i.id)" class="h-4 w-4 mr-1.5" />{{ has(i.id) ? 'Added' : 'Add to list' }}
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </CardContent>
    </Card>
    </section>

    <!-- 2. Everything selected -->
    <section id="review" class="space-y-4 scroll-mt-8">
      <div class="flex items-center gap-3">
        <span class="inline-grid place-items-center w-6 h-6 rounded-full bg-muted text-xs font-semibold">2</span>
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Review Selected Datasets</h2>
        <div class="h-px flex-1 bg-border" />
      </div>
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="flex flex-row items-start justify-between space-y-0 gap-4 pb-4">
        <div class="space-y-1.5">
          <CardTitle>Selected</CardTitle>
          <CardDescription>{{ list.length ? `${list.length} dataset${list.length > 1 ? 's' : ''} across ${bySite.length} website${bySite.length > 1 ? 's' : ''}.` : 'Nothing selected yet. Add datasets above.' }}</CardDescription>
        </div>
        <Button v-if="list.length" variant="ghost" size="sm" @click="picked = []">Clear all</Button>
      </CardHeader>
      <CardContent>
        <div v-if="!list.length" class="rounded-md border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">Nothing added yet.</div>
        <!-- Grouped by asset class, one row per asset, how it is modelled across. -->
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-sm">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="w-44 py-1 pr-3 font-medium">Asset</th>
                <th v-for="v in VEHICLES" :key="v.id" class="py-1 pr-3 font-medium">{{ v.title }}</th>
              </tr>
            </thead>
            <tbody v-for="g in selectedRows" :key="g.cls.id">
              <tr><th colspan="4" class="border-t bg-muted/40 px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide">{{ g.cls.title }}</th></tr>
              <tr v-for="r in g.rows" :key="r.key" class="align-top border-t">
                <td class="py-2 pr-3 font-medium"><Tag :title="regionTitle(r.region)">{{ REGION_CODE[r.region] || r.region }}</Tag> {{ r.asset }}</td>
                <td v-for="v in VEHICLES" :key="v.id" class="py-2 pr-3">
                  <div v-for="i in r.cells[v.id]" :key="i.id" class="flex items-start justify-between gap-1">
                    <span class="min-w-0">{{ clip(i.name) }} <Tag v-if="i.code && i.code.length <= 10 && i.code !== i.name">{{ i.code }}</Tag> <span class="text-xs text-muted-foreground">{{ HOW[i.how].site }}</span></span>
                    <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" title="Remove" @click="toggle(i.id)"><X class="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </section>

    <!-- 3. Download list, by website -->
    <section v-if="list.length" id="download" class="space-y-4 scroll-mt-8">
      <div class="flex items-center gap-3">
        <span class="inline-grid place-items-center w-6 h-6 rounded-full bg-muted text-xs font-semibold">3</span>
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Download Datasets</h2>
        <div class="h-px flex-1 bg-border" />
      </div>
      <div class="space-y-8">
      <Card v-for="g in bySite" :key="g.site" class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4">
          <CardTitle class="text-xl">{{ g.site }}</CardTitle>
          <CardDescription>{{ g.items.length }} to download here. Open the page, follow the steps, then import the files.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- What to download: the same for both ways -->
          <div>
            <div class="font-medium text-muted-foreground text-xs mb-1">Datasets to download</div>
            <div class="overflow-x-auto rounded-md border">
              <table class="w-full min-w-[640px] text-sm">
                <tbody>
                  <tr v-for="i in g.items" :key="i.id" class="border-t">
                    <td class="px-3 py-2 whitespace-nowrap"><Tag v-if="i.kind === 'Index'">INDEX</Tag><Tag v-else-if="i.code && i.code.length <= 10 && i.code !== i.name">{{ i.code }}</Tag></td>
                    <td class="px-3 py-2 min-w-0 font-medium" :title="i.name">{{ clip(i.name) }}</td>
                    <td class="px-3 py-2 whitespace-nowrap"><Tag v-if="distFlag(i)" :variant="distFlag(i) === 'Acc' ? 'ok' : 'warn'">{{ distFlag(i) }}</Tag></td>
                    <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ i.ccy }}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ i.returnType }}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-muted-foreground" :title="dateSourceNote(i)">{{ i.inception || '—' }}</td>
                    <td class="px-3 py-2 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <a v-for="l in i.links.filter((x) => !g.sharedUrls.has(x.url))" :key="l.url" :href="l.url" target="_blank" rel="noopener noreferrer" class="no-underline">
                          <Button variant="outline" size="sm" class="h-7"><ExternalLink class="h-3.5 w-3.5 mr-1.5" />{{ l.label }}</Button>
                        </a>
                        <Button variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground" title="Remove" @click="toggle(i.id)"><X class="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Two ways to get them. Assisted appears only for sites that have a bookmarklet. -->
          <div v-if="g.bookmarklet" class="flex gap-1 border-b" role="tablist">
            <button
              v-for="m in [['manual', 'Manual'], ['assisted', 'Assisted']]" :key="m[0]" type="button" role="tab" :aria-selected="mode(g.site) === m[0]"
              class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
              :class="mode(g.site) === m[0] ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
              @click="modes = { ...modes, [g.site]: m[0] }"
            >{{ m[1] }}</button>
          </div>

          <!-- Manual: open the page and download by hand -->
          <div v-if="!g.bookmarklet || mode(g.site) === 'manual'" class="space-y-6">
            <GifPreview :slug="slug(g.site)" :title="g.site" />
            <div class="space-y-4">
              <div v-if="g.shared.length" class="flex flex-wrap gap-2">
                <a v-for="l in g.shared" :key="l.url" :href="l.url" target="_blank" rel="noopener noreferrer" class="no-underline">
                  <Button variant="outline" size="sm"><ExternalLink class="h-3.5 w-3.5 mr-1.5" />{{ l.label }}</Button>
                </a>
              </div>
              <div v-for="h in g.hows" :key="h.title" class="text-sm">
                <div class="font-medium text-muted-foreground text-xs mb-1">{{ g.hows.length > 1 ? h.title : 'Steps' }}</div>
                <ol class="list-decimal pl-5 space-y-1">
                  <li v-for="(s, k) in h.steps" :key="k">{{ s }}</li>
                </ol>
                <p class="text-xs text-muted-foreground mt-1">You will get: {{ h.format }} Import it as it is.</p>
              </div>
            </div>
          </div>

          <!-- Assisted: a bookmarklet, made once, that does the clicking on the site -->
          <div v-else class="rounded-md border bg-muted/30 p-4 space-y-4">
            <div class="flex items-center gap-2 font-semibold">One-click download <Tag>bookmarklet</Tag></div>

            <ol class="list-decimal pl-5 space-y-2 text-sm">
              <li>
                Drag this button to your bookmarks bar. You only do this once.
                <div class="mt-2">
                  <a
                    :href="g.bookmarklet.href" draggable="true" title="Drag me to your bookmarks bar"
                    class="inline-flex items-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-grab no-underline"
                    @click.prevent="dragHint = true"
                  >{{ g.bookmarklet.label }}</a>
                  <span v-if="dragHint" class="ml-2 text-xs text-muted-foreground">Drag it, don't click it here.</span>
                  <div class="text-xs text-muted-foreground mt-1">It covers {{ g.bookmarklet.indexes.join(', ') }}.</div>
                </div>
              </li>
              <li>
                Open the site:
                <a :href="g.bookmarklet.openUrl" target="_blank" rel="noopener noreferrer" class="no-underline ml-1">
                  <Button variant="outline" size="sm"><ExternalLink class="h-3.5 w-3.5 mr-1.5" />{{ g.bookmarklet.openLabel }}</Button>
                </a>
              </li>
              <template v-if="g.bookmarklet.oneShot">
                <li>
                  Click the bookmark. A small panel opens on that ticker's page and <strong>Update</strong> is already chosen: the first time it brings in the full history, and every time after that only what's new, starting the day after the newest date it already has. Choose <strong>Full history</strong> to redo everything, or <strong>Custom</strong> for a range of your own. It shows the range before you press {{ g.bookmarklet.action }}.
                </li>
                <li>Press <strong>{{ g.bookmarklet.action }}</strong>. If the page is not already at that range, it moves there first and asks you to press {{ g.bookmarklet.action }} again once it has loaded.</li>
                <li>It reads the table the page itself shows and saves it as one CSV file, exactly those values &mdash; no clicking through the page yourself. In Chrome or Edge it asks for a folder (make a new one, as Downloads and Desktop aren't allowed) and saves there; otherwise it's a normal browser download.</li>
                <li>Repeat for each ticker &mdash; open its page, click the bookmark. Then use <strong>Import Files</strong> in Portfolio Engine and pick the files: it merges by date, and a newer file replaces older data for the same dates.</li>
              </template>
              <template v-else>
                <li>
                  Click the bookmark. A small panel opens on that page and <strong>Update</strong> is already chosen: the first time it brings in the full history, and every time after that only what's new, starting the day after the newest date it already has. Choose <strong>Full history</strong> to redo everything, or <strong>Custom</strong> for a range of your own. It shows the files it will download before you press Start.
                </li>
                <li>Press <strong>Start</strong> and <strong>keep that tab open and in front</strong> until it says Done. Browsers pause background tabs, so it can't run while you look at another tab.</li>
                <li>It fills in the page's form and presses its <strong>{{ g.bookmarklet.action }}</strong> button for you, one file after another, with a pause of a few seconds each time, as a person would. That's the same download you'd do by hand, without the clicking.</li>
                <li>In Chrome or Edge it asks for <strong>one folder</strong> (make a new one, as Downloads and Desktop aren't allowed) and saves every file there with no more prompts. In other browsers the files download as usual: the first three go out together so your browser asks to <strong>allow multiple downloads</strong>, so choose Allow; it waits about 15 seconds for that. Then use <strong>Import Files</strong> in Portfolio Engine and pick them: it merges the files by date, and a newer file replaces older data for the same dates.</li>
              </template>
            </ol>

            <p class="text-xs text-muted-foreground">
              The bookmark remembers where it left off in this browser, so clearing that site's data makes the next Update a full history.
              This just saves you the clicking: {{ g.bookmarklet.oneShot ? 'the same page you would read by hand' : 'the same form and the same download button' }}, so {{ g.bookmarklet.oneShot ? 'a file takes one click instead of a manual copy-paste' : 'a few years of files take one click instead of many' }}. It runs only on that page, is meant for your own study, and Xfina never sees the data. Xfina isn't affiliated with {{ g.bookmarklet.site }}.
              <template v-if="g.bookmarklet.caution">{{ g.bookmarklet.caution }} Read their
                <a :href="g.bookmarklet.termsUrl" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">terms of use</a>.</template>
              <template v-else>Their
                <a :href="g.bookmarklet.termsUrl" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">terms of use</a>
                apply here as they do when downloading by hand.</template>
              <template v-if="g.bookmarklet.skipped"> {{ g.bookmarklet.skipped }} other {{ g.bookmarklet.skipped > 1 ? 'datasets here are' : 'dataset here is' }} not covered, so download {{ g.bookmarklet.skipped > 1 ? 'them' : 'it' }} from the site.</template>
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </section>
  </AppShell>
</template>
