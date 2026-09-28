<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { ArrowLeft, ExternalLink, X, Check, Bookmark } from 'lucide-vue-next';
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

// The download list is grouped by website, so each site is visited once. The site's one download page, where it
// has one (HOW's `page`), shows once in the card header; links specific to one dataset (a ticker's own page) stay
// on its row.
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
    // Each source with the datasets it serves here, since its steps can depend on them.
    const hows = [...new Set(its.map((i) => i.how))].map((h) => ({ ...HOW[h], items: its.filter((i) => i.how === h) }));
    const region = its.some((i) => i.region === 'india') ? 0 : 1;
    const vehicle = Math.min(...its.map(vehicleRank));
    return { site, items: its, page: hows[0].page, terms: hows[0].terms, hows, bookmarklet: bookmarkletFor(site, its), region, vehicle };
  });
  return groups.sort((a, b) => a.region - b.region || a.vehicle - b.vehicle || a.site.localeCompare(b.site));
});

const anyBookmark = computed(() => bySite.value.some((g) => g.bookmarklet));
// A HOW's steps or format: text, or a function of the datasets it serves.
const txt = (v, items) => (typeof v === 'function' ? v(items) : v);
// Clicking a bookmarklet link on this page would run it here, where it does nothing useful. It is for dragging.
const dragHint = ref(false);
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
                    <span class="min-w-0">{{ clip(i.name) }} <Tag v-if="i.code && i.code.length <= 10 && i.code !== i.name && HOW[i.how].site !== 'AMFI'">{{ i.code }}</Tag> <span class="text-xs text-muted-foreground">{{ HOW[i.how].site }}</span></span>
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
      <!-- The bookmark, explained once for every site that has one -->
      <p v-if="anyBookmark" class="text-sm text-muted-foreground">
        Sites cap what one request returns (a year on NSE Indices, five years on AMFI), so a long history is many downloads.
        Where a site has an <strong class="text-foreground">Xfina bookmark</strong>, it does those downloads for you on the site's own page, at a person's pace:
        drag it to your bookmarks bar once, open the site, click it and press Start, keeping that tab in front until it says Done.
        It remembers what it fetched, so the next run only gets what's new. Chrome and Edge save to one folder you pick; elsewhere, allow multiple downloads.
        It runs only in your browser: Xfina never sees the data, and isn't affiliated with these sites.
        Then use <strong class="text-foreground">Import Files</strong> in Portfolio Engine; it merges by date, newer replacing older.
        <span v-if="dragHint" class="text-foreground">Drag the bookmark, don't click it here.</span>
      </p>
      <div class="space-y-8">
      <Card v-for="g in bySite" :key="g.site" class="bg-card border-border shadow-sm">
        <CardHeader class="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 space-y-1.5">
            <CardTitle class="text-xl">{{ g.site }}</CardTitle>
            <CardDescription>{{ g.items.length }} dataset{{ g.items.length > 1 ? 's' : '' }} to download here. Follow the steps, then import the files.</CardDescription>
          </div>
          <!-- The bookmark (to drag), the site's one download page where it has one, and its terms of use -->
          <div class="flex flex-wrap items-center gap-2 sm:shrink-0">
            <a
              v-if="g.bookmarklet" :href="g.bookmarklet.href" draggable="true" title="Drag to your bookmarks bar"
              class="inline-flex items-center h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-grab no-underline"
              @click.prevent="dragHint = true"
            ><Bookmark class="h-3.5 w-3.5 mr-1.5" />{{ g.bookmarklet.label }}</a>
            <a v-if="g.page" :href="g.page" target="_blank" rel="noopener noreferrer" class="no-underline">
              <Button variant="outline" size="sm"><ExternalLink class="h-3.5 w-3.5 mr-1.5" />Downloads page</Button>
            </a>
            <a v-if="g.terms" :href="g.terms" target="_blank" rel="noopener noreferrer" class="no-underline">
              <Button variant="ghost" size="sm" class="text-muted-foreground"><ExternalLink class="h-3.5 w-3.5 mr-1.5" />Terms</Button>
            </a>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <div class="font-medium text-muted-foreground text-xs mb-1">Datasets to download</div>
            <div class="overflow-x-auto rounded-md border">
              <table class="w-full min-w-[640px] text-sm">
                <tbody>
                  <tr v-for="i in g.items" :key="i.id" class="border-t">
                    <td class="px-3 py-2 whitespace-nowrap"><Tag v-if="i.kind === 'Index'">INDEX</Tag><Tag v-else-if="i.code && i.code.length <= 10 && i.code !== i.name">{{ i.code }}</Tag></td>
                    <td class="px-3 py-2 min-w-0 whitespace-nowrap font-medium" :title="i.name">{{ clip(i.name) }}</td>
                    <td class="px-3 py-2 whitespace-nowrap"><Tag v-if="distFlag(i)" :variant="distFlag(i) === 'Acc' ? 'ok' : 'warn'">{{ distFlag(i) }}</Tag></td>
                    <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ i.ccy }}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{{ i.returnType }}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-muted-foreground" :title="dateSourceNote(i)">{{ i.inception || '—' }}</td>
                    <td class="px-3 py-2 text-right">
                      <div class="flex items-center justify-end gap-1.5">
                        <a v-for="l in i.links.filter((x) => x.url !== g.page)" :key="l.url" :href="l.url" target="_blank" rel="noopener noreferrer" class="no-underline">
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

          <!-- By hand: the walkthrough beside the steps for what is selected -->
          <div class="grid gap-4 md:grid-cols-2 md:items-start">
            <GifPreview :slug="slug(g.site)" :title="g.site" />
            <div class="space-y-3 text-sm">
              <div v-for="h in g.hows" :key="h.title">
                <div class="font-medium text-muted-foreground text-xs mb-1">{{ g.hows.length > 1 ? h.title : 'Steps' }}</div>
                <ol class="list-decimal pl-5 space-y-1">
                  <li v-for="(s, k) in txt(h.steps, h.items)" :key="k">{{ s }}</li>
                </ol>
                <p class="text-xs text-muted-foreground mt-1">You get: {{ txt(h.format, h.items) }}</p>
              </div>
            </div>
          </div>

          <!-- What is particular to this site's bookmark -->
          <p v-if="g.bookmarklet && (g.bookmarklet.oneShot || g.bookmarklet.skipped || g.bookmarklet.caution)" class="text-xs text-muted-foreground">
            <template v-if="g.bookmarklet.oneShot">This bookmark saves one ticker per click: open a ticker's page from its row, click the bookmark, then {{ g.bookmarklet.action }}. </template>
            <template v-if="g.bookmarklet.skipped">It doesn't cover {{ g.bookmarklet.skipped }} of these, so download {{ g.bookmarklet.skipped > 1 ? 'them' : 'it' }} by hand. </template>
            {{ g.bookmarklet.caution }}
          </p>
        </CardContent>
      </Card>
      </div>
    </section>
  </AppShell>
</template>
