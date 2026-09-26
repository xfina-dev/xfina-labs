<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { ArrowLeft, Download, X } from 'lucide-vue-next';
import AppShell from '@/components/AppShell.vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Tag from './Tag.vue';
import { sources, regions, provided } from './guide.js';

const TABS = [...regions.map((r) => ({ id: r.id, title: r.title })), { id: 'provided', title: 'Provided' }];
const active = ref('india');
const fromHash = () => {
  const h = location.hash.slice(1);
  if (TABS.some((t) => t.id === h)) active.value = h;
};
const select = (id) => {
  active.value = id;
  history.replaceState(null, '', `#${id}`);
};

// What the user picked, as "region|asset|type" keys. Kept in this browser only.
const STORE = 'xfina_labs_guide_selection';
const picked = ref([]);
const has = (k) => picked.value.includes(k);
const key = (r, a, o) => `${r.id}|${a.name}|${o.type}`;
const toggle = (k) => (picked.value = has(k) ? picked.value.filter((x) => x !== k) : [...picked.value, k]);
const chip = (t) => (t === 'Index' ? 'TRI' : t);

onMounted(() => {
  fromHash();
  window.addEventListener('hashchange', fromHash);
  try { picked.value = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { /* storage blocked: start empty */ }
});
watch(picked, (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* ignore */ } }, { deep: true });

const current = computed(() => regions.find((r) => r.id === active.value));
const keysOf = (r) => r.assets.flatMap((a) => a.options.map((o) => key(r, a, o)));
const selectAll = () => (picked.value = [...new Set([...picked.value, ...keysOf(current.value)])]);
const clearTab = () => { const ks = keysOf(current.value); picked.value = picked.value.filter((k) => !ks.includes(k)); };
const countIn = (r) => keysOf(r).filter(has).length;

// The list on the right: everything picked, in the order the guide lists it.
const list = computed(() => regions.flatMap((r) => r.assets.flatMap((a) => a.options.filter((o) => has(key(r, a, o))).map((o) => ({ k: key(r, a, o), r, a, o })))));

const sample = 'date,value\n2020-01-01,100.23\n2020-01-02,101.12\n2020-01-03,99.87\n';
const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`;
</script>

<template>
  <AppShell tool="/portfolio-engine/">
    <template #tagline>
      Pick the datasets you need and get the download steps for exactly those.<br />
      Everything runs in your browser; nothing is uploaded to any server.
    </template>

    <div>
      <a href="/portfolio-engine/" class="no-underline">
        <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4 mr-2" />Back to Portfolio Engine</Button>
      </a>
    </div>

    <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start">
      <!-- Choose -->
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4">
          <CardTitle>Choose datasets</CardTitle>
          <CardDescription>For each asset, pick how you want to model it: the index (TRI), an ETF or a mutual fund. Pick as many as you like.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <nav class="flex gap-1 border-b overflow-x-auto overflow-y-hidden" role="tablist">
            <button
              v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="active === t.id"
              class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
              :class="active === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
              @click="select(t.id)"
            >{{ t.title }}<span v-if="t.id !== 'provided' && countIn(regions.find((r) => r.id === t.id))" class="ml-1.5 text-xs font-normal text-muted-foreground">{{ countIn(regions.find((r) => r.id === t.id)) }}</span></button>
          </nav>

          <template v-if="current && active !== 'provided'">
            <p class="text-sm text-muted-foreground">{{ current.note }}</p>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="selectAll">Select all</Button>
              <Button variant="ghost" size="sm" @click="clearTab">Clear</Button>
            </div>
            <ul class="divide-y">
              <li v-for="a in current.assets" :key="a.name" class="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span class="font-medium">{{ a.name }}</span>
                <span class="flex gap-1.5">
                  <button
                    v-for="o in a.options" :key="o.type" type="button" :aria-pressed="has(key(current, a, o))"
                    class="h-8 px-3 rounded-md border text-sm font-medium transition-colors"
                    :class="has(key(current, a, o)) ? 'bg-primary text-primary-foreground border-transparent' : 'bg-background hover:bg-accent'"
                    @click="toggle(key(current, a, o))"
                  >{{ chip(o.type) }}</button>
                </span>
              </li>
            </ul>
          </template>

          <template v-else>
            <p class="text-sm text-muted-foreground">Supplied by Xfina, so there is nothing to pick or download. Each is filled from several sources, oldest first.</p>
            <ul class="space-y-3">
              <li v-for="p in provided" :key="p.name" class="rounded-md border p-3">
                <div class="font-medium">{{ p.name }}</div>
                <div class="text-sm text-muted-foreground">{{ p.use }}</div>
                <ul class="list-disc pl-5 text-sm mt-1"><li v-for="s in p.sources" :key="s">{{ s }}</li></ul>
              </li>
            </ul>
            <p class="text-sm text-muted-foreground">Need a different source? Import your own file the same way as any other series.</p>
          </template>
        </CardContent>
      </Card>

      <!-- Your list -->
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="flex flex-row items-start justify-between space-y-0 gap-4 pb-4">
          <div class="space-y-1.5">
            <CardTitle>Your download list</CardTitle>
            <CardDescription>{{ list.length ? `${list.length} selected. Open one for its steps.` : 'Pick datasets on the left. Their download steps appear here.' }}</CardDescription>
          </div>
          <Button v-if="list.length" variant="ghost" size="sm" @click="picked = []">Clear all</Button>
        </CardHeader>
        <CardContent>
          <div v-if="!list.length" class="rounded-md border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
            Nothing selected yet.
          </div>
          <Accordion v-else type="multiple" :default-value="[list[0].k]">
            <AccordionItem v-for="i in list" :key="i.k" :value="i.k">
              <AccordionTrigger class="text-left">
                <span class="flex items-center gap-3">
                  <Tag :variant="i.o.type === 'Index' ? 'default' : 'warn'">{{ chip(i.o.type) }}</Tag>
                  <span><span class="font-medium">{{ i.a.name }}</span> <span class="text-xs font-normal text-muted-foreground">{{ i.r.title }} · {{ i.o.label }}</span></span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div class="grid gap-4 md:grid-cols-2 items-start">
                  <div class="space-y-3">
                    <div class="text-sm font-medium">{{ sources[i.o.src].title }}</div>
                    <ol class="list-decimal pl-5 space-y-1.5 text-sm">
                      <li v-for="(step, k) in sources[i.o.src].steps" :key="k">{{ step }}</li>
                    </ol>
                    <p class="text-xs text-muted-foreground">
                      Confirm on import: <strong>{{ sources[i.o.src].returnType }}</strong>, <strong>{{ sources[i.o.src].currency }}</strong>.
                    </p>
                    <Button variant="ghost" size="sm" class="h-7 px-2 -ml-2 text-muted-foreground" @click="toggle(i.k)"><X class="h-3.5 w-3.5 mr-1" />Remove</Button>
                  </div>
                  <figure class="space-y-1.5">
                    <img v-if="sources[i.o.src].gif" :src="`/help/${sources[i.o.src].gif}`" :alt="`Steps: ${sources[i.o.src].title}`" class="rounded-md border w-full" />
                    <div v-else class="aspect-video rounded-md border border-dashed bg-muted/40 grid place-items-center text-xs text-muted-foreground text-center p-4">
                      GIF walkthrough goes here<br /><span class="font-mono">/help/{{ i.o.src }}.gif</span>
                    </div>
                    <figcaption class="text-xs text-muted-foreground">
                      Source:
                      <a v-if="sources[i.o.src].url" :href="sources[i.o.src].url" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-foreground">{{ sources[i.o.src].site }}</a>
                      <span v-else>{{ sources[i.o.src].site }}</span>
                    </figcaption>
                  </figure>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>

    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle>Required file format</CardTitle>
        <CardDescription>The same for every dataset. Shape each download like this, then use Import Files on the Portfolio Engine page.</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-6 md:grid-cols-2 items-start">
          <div class="space-y-2">
            <ul class="list-disc pl-5 text-sm space-y-1">
              <li>CSV, one series per file.</li>
              <li>Two columns named <code class="font-mono">date</code> and <code class="font-mono">value</code>.</li>
              <li>Dates as <code class="font-mono">YYYY-MM-DD</code>, oldest first, no duplicates.</li>
              <li>Values are positive numbers: an index level, a NAV or an adjusted close.</li>
            </ul>
            <p class="text-sm text-muted-foreground">
              Return type (total return, adjusted price or price only) and currency are never guessed. You confirm both after import, and a price-only series is flagged because it leaves out dividends.
            </p>
          </div>
          <div class="space-y-2">
            <pre class="rounded-md border bg-muted/40 p-3 text-xs font-mono overflow-x-auto">{{ sample }}</pre>
            <a :href="sampleHref" download="sample.csv" class="no-underline"><Button variant="outline" size="sm"><Download class="h-4 w-4 mr-2" />Download sample.csv</Button></a>
          </div>
        </div>
      </CardContent>
    </Card>
  </AppShell>
</template>
