<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { ArrowLeft, ExternalLink, X, Check } from 'lucide-vue-next';
import AppShell from '@/components/AppShell.vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Tag from './Tag.vue';
import GifPreview from './GifPreview.vue';
import { bookmarkletFor, PERIODS, periodDates } from './bookmarklets.js';
import { CLASSES, REGIONS, VEHICLES, LISTINGS, HOW, vehiclesFor, listingsFor, groupsFor, findDataset, dateNote, dateSourceNote } from './guide.js';

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
  // An index is named after its asset ("Nifty 50" then "Nifty 50 TRI"), so a heading only repeats it: one flat list.
  return vehicle.value === 'index' ? (g.length ? [{ asset: null, instruments: g.flatMap((x) => x.instruments) }] : []) : g;
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

onMounted(() => {
  fromHash();
  window.addEventListener('hashchange', fromHash);
  try { picked.value = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { /* storage blocked: start empty */ }
});
watch(picked, (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* ignore */ } }, { deep: true });

// The download list is grouped by website, so each site is visited once. A page link that every
// dataset in the group shares (for example the NSE Indices historical data page) shows once at the
// top; links specific to one dataset (a ticker's own page) stay on its row.
const bySite = computed(() => {
  const m = new Map();
  for (const i of list.value) {
    const site = HOW[i.how].site;
    m.set(site, [...(m.get(site) || []), i]);
  }
  return [...m.entries()].map(([site, its]) => {
    const urls = new Map();
    for (const i of its) for (const l of i.links) urls.set(l.url, { l, n: (urls.get(l.url)?.n || 0) + 1 });
    const shared = its.length > 1 ? [...urls.values()].filter((u) => u.n === its.length).map((u) => u.l) : [];
    const sharedUrls = new Set(shared.map((l) => l.url));
    const hows = [...new Set(its.map((i) => i.how))].map((h) => HOW[h]);
    return { site, items: its, shared, sharedUrls, hows, bookmarklet: bookmarkletFor(site, its, { from: from.value, start: customStart.value, end: customEnd.value }) };
  });
});

// Clicking a bookmarklet link on this page would run it here, where it does nothing useful. It is for dragging.
const dragHint = ref(false);
// Manual or assisted, per website. Assisted exists only where a bookmarklet does.
const modes = ref({});
const mode = (site) => modes.value[site] || 'manual';
// The period a run covers: the current financial year (the default, so a repeat run refreshes it), the previous one, the full history, or a custom range.
const from = ref('CURRENT');
const customStart = ref('');
const customEnd = ref('');
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The dates shown in the Start and End fields: the period's own dates, or the user's for Custom. Every field is
// editable; touching one switches the period to Custom, seeded with the dates that were showing.
const dates = (g) => {
  if (from.value === 'CUSTOM') return { start: customStart.value, end: customEnd.value };
  const d = periodDates(from.value);
  return { start: d.start || g.bookmarklet.earliest || '', end: d.end };
};
const pickPeriod = (id, g) => {
  if (id === 'CUSTOM') { const d = dates(g); customStart.value = d.start; customEnd.value = d.end; }
  from.value = id;
};
const editDate = (which, value, g) => {
  const d = dates(g);
  customStart.value = which === 'start' ? value : d.start;
  customEnd.value = which === 'end' ? value : d.end;
  from.value = 'CUSTOM';
};
const today = isoDay(new Date());
const shownDates = computed(() => periodDates(from.value));
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const tile = (on) => ['text-left rounded-md border p-3 transition-colors', on ? 'border-primary bg-primary/5' : 'hover:bg-muted'];
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
                <div class="font-medium">{{ c.title }}</div><div class="text-xs text-muted-foreground">{{ c.blurb }}</div>
              </button>
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">2</span>Region</h3>
            <div class="grid gap-2">
              <button v-for="r in REGIONS" :key="r.id" type="button" :class="tile(region === r.id)" @click="pick('region', r.id)">
                <div class="font-medium">{{ r.title }}</div><div class="text-xs text-muted-foreground">{{ r.blurb }}</div>
              </button>
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">3</span>Model it as</h3>
            <div class="grid gap-2">
              <!-- All three always show; ones with nothing behind them for this class and region are dimmed. -->
              <button v-for="v in VEHICLES" :key="v.id" type="button" :disabled="!offers(v.id)" :class="[tile(vehicle === v.id), !offers(v.id) && 'opacity-40 cursor-not-allowed']" @click="pick('vehicle', v.id)">
                <div class="font-medium">{{ v.title }}</div><div class="text-xs text-muted-foreground">{{ v.blurb }}</div>
              </button>
            </div>
          </section>

          <!-- Lane 4 keeps its column so the picker never changes shape. Its content shows only for US and
               Global ETFs, where Irish ETFs are the default; otherwise the lane is simply empty. -->
          <section class="space-y-2">
            <template v-if="showListing">
              <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">4</span>{{ vehicle === 'mf' ? 'Which plan' : 'Which ETFs' }}</h3>
              <div class="grid gap-2">
                <button v-for="l in listings" :key="l.id" type="button" :class="tile(listing === l.id)" @click="pick('listing', l.id)">
                  <div class="font-medium">{{ l.title }}</div><div class="text-xs text-muted-foreground">{{ l.blurb }}</div>
                </button>
              </div>
            </template>
          </section>
        </div>

        <!-- Every asset for the path, grouped, each with its oldest three -->
        <section v-if="vehicle" class="space-y-6 border-t pt-6">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="text-sm font-semibold">Curated Datasets</h3>
            <span v-if="vehicle !== 'index'" class="text-xs text-muted-foreground">The three with the longest history for each, oldest first</span>
          </div>
          <p v-if="!groups.length" class="text-sm text-muted-foreground">Nothing is listed for this yet.</p>
          <div v-for="g in groups" :key="g.asset || 'indexes'" class="space-y-2">
            <div v-if="g.asset" class="text-sm font-medium">{{ g.asset }}</div>
            <ol class="divide-y rounded-md border">
              <li v-for="(i, k) in g.instruments" :key="i.id" class="flex flex-wrap items-center justify-between gap-3 p-3">
                <div class="flex items-start gap-3 min-w-0">
                  <span v-if="vehicle !== 'index'" class="inline-grid place-items-center w-6 h-6 shrink-0 rounded-full bg-muted text-xs font-semibold">{{ k + 1 }}</span>
                  <div class="min-w-0">
                    <div class="font-medium">{{ clip(i.name) }} <Tag v-if="i.code && i.code.length <= 10 && i.code !== i.name">{{ i.code }}</Tag> <Tag v-if="i.plan" variant="warn">{{ i.plan }}</Tag></div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      <span class="font-mono text-foreground">{{ dateNote(i) }}</span>
                      <span v-if="dateSourceNote(i)"> ({{ dateSourceNote(i) }})</span> · {{ i.ccy }} · {{ i.returnType }}
                    </div>
                  </div>
                </div>
                <Button :variant="has(i.id) ? 'default' : 'outline'" size="sm" @click="toggle(i.id)">
                  <Check v-if="has(i.id)" class="h-4 w-4 mr-1.5" />{{ has(i.id) ? 'Added' : 'Add to list' }}
                </Button>
              </li>
            </ol>
          </div>
        </section>
      </CardContent>
    </Card>

    <!-- 2. Everything selected -->
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
        <ul v-else class="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <li v-for="i in list" :key="i.id" class="flex items-start justify-between gap-2 rounded-md border p-3">
            <div class="min-w-0 text-sm">
              <div class="font-medium">{{ clip(i.name) }} <Tag v-if="i.code && i.code.length <= 10 && i.code !== i.name">{{ i.code }}</Tag></div>
              <div class="text-xs text-muted-foreground mt-0.5">{{ i.asset }} · {{ HOW[i.how].site }} · {{ i.ccy }}</div>
            </div>
            <Button variant="ghost" size="sm" class="h-7 px-2 -mr-1 text-muted-foreground" title="Remove" @click="toggle(i.id)"><X class="h-4 w-4" /></Button>
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 3. Download list, by website -->
    <div v-if="list.length" class="space-y-8">
      <h2 class="text-xl font-semibold tracking-tight">Download list</h2>
      <Card v-for="g in bySite" :key="g.site" class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4">
          <CardTitle class="text-xl">{{ g.site }}</CardTitle>
          <CardDescription>{{ g.items.length }} to download here. Open the page, follow the steps, then import the files.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- What to download: the same for both ways -->
          <div>
            <div class="font-medium text-muted-foreground text-xs mb-1">Datasets to download</div>
            <ul class="divide-y rounded-md border">
              <li v-for="i in g.items" :key="i.id" class="flex flex-wrap items-center justify-between gap-2 p-2.5">
                <div class="min-w-0 text-sm">
                  <span class="font-medium">{{ clip(i.name) }}</span> <Tag v-if="i.code && i.code.length <= 10 && i.code !== i.name">{{ i.code }}</Tag>
                  <div class="text-xs text-muted-foreground">{{ i.ccy }} · {{ i.returnType }}</div>
                </div>
                <div class="flex items-center gap-1.5">
                  <a v-for="l in i.links.filter((x) => !g.sharedUrls.has(x.url))" :key="l.url" :href="l.url" target="_blank" rel="noopener noreferrer" class="no-underline">
                    <Button variant="outline" size="sm" class="h-7"><ExternalLink class="h-3.5 w-3.5 mr-1.5" />{{ l.label }}</Button>
                  </a>
                  <Button variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground" title="Remove" @click="toggle(i.id)"><X class="h-4 w-4" /></Button>
                </div>
              </li>
            </ul>
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

          <!-- Assisted: a bookmarklet, dragged to the bookmarks bar, that does the clicking on the site -->
          <div v-else class="rounded-md border bg-muted/30 p-4 space-y-4">
            <div class="flex items-center gap-2 font-semibold">One-click download <Tag>bookmarklet</Tag></div>

            <div class="space-y-1.5">
              <div class="text-sm text-muted-foreground">Period</div>
              <!-- One row: the period choices with their dates. Editing a date makes it Custom. -->
              <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span class="inline-flex flex-wrap rounded-md border border-border overflow-hidden bg-background">
                  <button v-for="o in PERIODS" :key="o.id" type="button" class="px-3 h-8 text-sm font-medium transition-colors" :class="from === o.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'" @click="pickPeriod(o.id, g)">{{ o.label }}</button>
                </span>
                <label class="flex items-center gap-2 text-muted-foreground">Start
                  <input :value="dates(g).start" type="date" :max="today" class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground" @input="editDate('start', $event.target.value, g)" />
                </label>
                <label class="flex items-center gap-2 text-muted-foreground">End
                  <input :value="dates(g).end" type="date" :max="today" :min="dates(g).start || undefined" class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground" @input="editDate('end', $event.target.value, g)" />
                </label>
              </div>
              <p v-if="g.bookmarklet.invalid" class="text-xs text-destructive">{{ g.bookmarklet.invalid }}</p>
              <p class="text-xs text-muted-foreground">
                Covers {{ PERIODS.find((o) => o.id === from)?.hint }}. The site exports at most a year at a time, so files come one per financial year (April to March). Current and Previous FY are worked out again each time you click the bookmark, so running it later covers whatever is current then, and importing a newer file replaces the same dates from older ones.
              </p>
            </div>

            <ol class="list-decimal pl-5 space-y-2 text-sm border-t pt-4">
              <li>
                Drag this button to your bookmarks bar. It is generated from your choice above, so drag it again if you change that.
                <div v-if="g.bookmarklet.invalid" class="mt-2 text-xs text-muted-foreground">Set a valid period above and the button will appear here.</div>
                <div v-else class="mt-2">
                  <a
                    :href="g.bookmarklet.href" draggable="true" :title="`Drag me to your bookmarks bar. ${g.bookmarklet.files} files across ${g.bookmarklet.indexes.length} ${g.bookmarklet.indexes.length > 1 ? 'indexes' : 'index'}`"
                    class="inline-flex items-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-grab no-underline"
                    @click.prevent="dragHint = true"
                  >{{ g.bookmarklet.label }}</a>
                  <span v-if="dragHint" class="ml-2 text-xs text-muted-foreground">Drag it, don't click it here.</span>
                  <div class="text-xs text-muted-foreground mt-1">It does {{ g.bookmarklet.indexes.join(', ') }}: about {{ g.bookmarklet.files }} {{ g.bookmarklet.files === 1 ? 'file' : 'files' }}, one after another.</div>
                </div>
              </li>
              <li>
                Open the site:
                <a :href="g.bookmarklet.openUrl" target="_blank" rel="noopener noreferrer" class="no-underline ml-1">
                  <Button variant="outline" size="sm"><ExternalLink class="h-3.5 w-3.5 mr-1.5" />{{ g.bookmarklet.openLabel }}</Button>
                </a>
              </li>
              <li>Click the bookmark and <strong>keep that tab open and in front</strong> until it says Done. Browsers pause background tabs, so it can't run while you look at another tab.</li>
              <li>It fills in the page's form and presses its <strong>csv format</strong> button for you, one financial year at a time and one index after another, with a short pause between files. That's the same download you'd do by hand, without the clicking.</li>
              <li>Your browser saves the files as it does for any download: in its usual folder, or wherever it asks you. Allow multiple downloads if it asks. Then use <strong>Import Files</strong> in Portfolio Engine and pick them: it merges the yearly files by date.</li>
            </ol>

            <p class="text-xs text-muted-foreground border-t pt-3">
              This just saves you the clicking: the same form and the same download button, so a few years of files take one click instead of many. It runs only on that page, is meant for your own study, and Xfina never sees the data. Xfina isn't affiliated with {{ g.bookmarklet.site }}; their
              <a :href="g.bookmarklet.termsUrl" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">terms of use</a>
              apply here as they do when downloading by hand.
              <template v-if="g.bookmarklet.skipped"> {{ g.bookmarklet.skipped }} other {{ g.bookmarklet.skipped > 1 ? 'datasets here are' : 'dataset here is' }} not covered, so download {{ g.bookmarklet.skipped > 1 ? 'them' : 'it' }} from the site.</template>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  </AppShell>
</template>
