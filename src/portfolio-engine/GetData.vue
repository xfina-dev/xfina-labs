<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { ArrowLeft, ExternalLink, X, Check } from 'lucide-vue-next';
import AppShell from '@/components/AppShell.vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Tag from './Tag.vue';
import GifPreview from './GifPreview.vue';
import { CLASSES, REGIONS, HOW, vehiclesFor, listingsFor, assetsFor, instrumentsFor, findDataset, dateNote, dateSourceNote } from './guide.js';

// The wizard: asset class → region → model as → (Irish or US ETFs) → asset → the oldest three.
// The path lives in the URL hash, e.g. #equity/india/etf/Nifty%2050, so a link lands on the same step.
const cls = ref(null);
const region = ref(null);
const vehicle = ref(null);
const listing = ref(null);
const asset = ref(null);

const vehicles = computed(() => (cls.value && region.value ? vehiclesFor(cls.value, region.value) : []));
const listings = computed(() => (cls.value && region.value && vehicle.value === 'etf' ? listingsFor(cls.value, region.value) : []));
const needsListing = computed(() => listings.value.length > 0);
const assets = computed(() => (vehicle.value && (!needsListing.value || listing.value) ? assetsFor(cls.value, region.value, vehicle.value, listing.value) : []));
const items = computed(() => (asset.value && assets.value.includes(asset.value) ? instrumentsFor(cls.value, region.value, vehicle.value, listing.value, asset.value) : []));

// Choosing a step clears the ones after it, because their options depend on it. Irish ETFs are the
// default for US and Global, and the first asset is chosen so the oldest three show straight away.
const firstAsset = () => (asset.value = assetsFor(cls.value, region.value, vehicle.value, listing.value)[0] || null);
const pick = (which, v) => {
  if (which === 'cls') { cls.value = v; region.value = vehicle.value = listing.value = asset.value = null; }
  if (which === 'region') { region.value = v; vehicle.value = listing.value = asset.value = null; }
  if (which === 'vehicle') {
    vehicle.value = v; asset.value = null;
    listing.value = v === 'etf' ? listingsFor(cls.value, region.value)[0]?.id || null : null;
    firstAsset();
  }
  if (which === 'listing') { listing.value = v; firstAsset(); }
  if (which === 'asset') asset.value = v;
};
const toHash = () => [cls.value, region.value, vehicle.value, listing.value, asset.value && encodeURIComponent(asset.value)].filter(Boolean).join('/');
const fromHash = () => {
  const [c, r, v, ...rest] = location.hash.slice(1).split('/');
  cls.value = CLASSES.some((x) => x.id === c) ? c : null;
  region.value = cls.value && REGIONS.some((x) => x.id === r) ? r : null;
  vehicle.value = region.value && vehiclesFor(cls.value, region.value).some((x) => x.id === v) ? v : null;
  listing.value = null; asset.value = null;
  if (!vehicle.value) return;
  const ls = v === 'etf' ? listingsFor(cls.value, region.value) : [];
  if (ls.length) listing.value = ls.some((x) => x.id === rest[0]) ? rest.shift() : ls[0].id;
  const a = rest[0] ? decodeURIComponent(rest[0]) : null;
  asset.value = a && assetsFor(cls.value, region.value, vehicle.value, listing.value).includes(a) ? a : assetsFor(cls.value, region.value, vehicle.value, listing.value)[0] || null;
};
watch([cls, region, vehicle, listing, asset], () => { try { history.replaceState(null, '', `#${toHash()}`); } catch { /* ignore */ } });

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
    return { site, items: its, shared, sharedUrls, hows };
  });
});

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
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          <section class="space-y-2">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">1</span>Asset class</h3>
            <div class="grid gap-2">
              <button v-for="c in CLASSES" :key="c.id" type="button" :class="tile(cls === c.id)" @click="pick('cls', c.id)">
                <div class="font-medium">{{ c.title }}</div><div class="text-xs text-muted-foreground">{{ c.blurb }}</div>
              </button>
            </div>
          </section>

          <section class="space-y-2" :class="!cls && 'opacity-50 pointer-events-none'">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">2</span>Region</h3>
            <div class="grid gap-2">
              <button v-for="r in REGIONS" :key="r.id" type="button" :class="tile(region === r.id)" @click="pick('region', r.id)">
                <div class="font-medium">{{ r.title }}</div><div class="text-xs text-muted-foreground">{{ r.blurb }}</div>
              </button>
            </div>
          </section>

          <section class="space-y-2" :class="!region && 'opacity-50 pointer-events-none'">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">3</span>Model it as</h3>
            <div class="grid gap-2">
              <button v-for="v in vehicles" :key="v.id" type="button" :class="tile(vehicle === v.id)" @click="pick('vehicle', v.id)">
                <div class="font-medium">{{ v.title }}</div><div class="text-xs text-muted-foreground">{{ v.blurb }}</div>
              </button>
              <p v-if="region && !vehicles.length" class="text-xs text-muted-foreground">Nothing is listed for this yet.</p>
            </div>
          </section>

          <section class="space-y-2" :class="!needsListing && 'opacity-50 pointer-events-none'">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">4</span>Which ETFs</h3>
            <div class="grid gap-2">
              <button v-for="l in listings" :key="l.id" type="button" :class="tile(listing === l.id)" @click="pick('listing', l.id)">
                <div class="font-medium">{{ l.title }}</div><div class="text-xs text-muted-foreground">{{ l.blurb }}</div>
              </button>
              <p v-if="!needsListing" class="text-xs text-muted-foreground">For US and Global ETFs only.</p>
            </div>
          </section>

          <section class="space-y-2" :class="!assets.length && 'opacity-50 pointer-events-none'">
            <h3 class="text-sm font-semibold flex items-center gap-2"><span class="inline-grid place-items-center w-5 h-5 rounded-full bg-muted text-[11px]">{{ needsListing ? 5 : 4 }}</span>Asset</h3>
            <div class="grid gap-2">
              <button v-for="a in assets" :key="a" type="button" :class="tile(asset === a)" @click="pick('asset', a)">
                <div class="font-medium">{{ a }}</div>
              </button>
            </div>
          </section>
        </div>

        <section v-if="asset" class="space-y-4 border-t pt-6">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="text-sm font-semibold">{{ items.length > 1 ? `The ${items.length} with the longest history` : 'Available' }} · {{ asset }}</h3>
            <span class="text-xs text-muted-foreground">Oldest first</span>
          </div>
          <ol class="divide-y rounded-md border">
            <li v-for="(i, k) in items" :key="i.id" class="flex flex-wrap items-center justify-between gap-3 p-3">
              <div class="flex items-start gap-3 min-w-0">
                <span class="inline-grid place-items-center w-6 h-6 shrink-0 rounded-full bg-muted text-xs font-semibold">{{ k + 1 }}</span>
                <div class="min-w-0">
                  <div class="font-medium">{{ clip(i.name) }} <Tag v-if="i.code && i.code.length <= 10">{{ i.code }}</Tag> <Tag v-if="i.plan" variant="warn">{{ i.plan }}</Tag></div>
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
        </section>
        <p v-else-if="vehicle" class="text-sm text-muted-foreground">Choose an asset to see its oldest datasets.</p>
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
              <div class="font-medium">{{ clip(i.name) }} <Tag v-if="i.code && i.code.length <= 10">{{ i.code }}</Tag></div>
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
          <GifPreview :slug="slug(g.site)" :title="g.site" />

          <div class="grid gap-6 lg:grid-cols-2 items-start">
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

            <div>
              <div class="font-medium text-muted-foreground text-xs mb-1">Download</div>
              <ul class="divide-y rounded-md border">
                <li v-for="i in g.items" :key="i.id" class="flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <div class="min-w-0 text-sm">
                    <span class="font-medium">{{ clip(i.name) }}</span> <Tag v-if="i.code && i.code.length <= 10">{{ i.code }}</Tag>
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
          </div>
        </CardContent>
      </Card>
    </div>
  </AppShell>
</template>
