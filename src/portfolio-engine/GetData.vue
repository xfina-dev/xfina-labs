<script setup>
import { ref, onMounted } from 'vue';
import { ArrowLeft, Download } from 'lucide-vue-next';
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
onMounted(() => {
  fromHash();
  window.addEventListener('hashchange', fromHash);
});

const sample = 'date,value\n2020-01-01,100.23\n2020-01-02,101.12\n2020-01-03,99.87\n';
const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`;
</script>

<template>
  <AppShell tool="/portfolio-engine/">
    <template #tagline>
      Where to download each dataset, and the file format the engine needs.<br />
      Everything runs in your browser; nothing is uploaded to any server.
    </template>

    <div>
      <a href="/portfolio-engine/" class="no-underline">
        <Button variant="outline" size="sm"><ArrowLeft class="h-4 w-4 mr-2" />Back to Portfolio Engine</Button>
      </a>
    </div>

    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle>Get your data in three steps</CardTitle>
        <CardDescription>Download from the original provider, shape it into a CSV, import it.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <ol class="grid gap-4 md:grid-cols-3">
          <li v-for="(t, i) in [['Download', 'Pick an asset below and follow its steps to get history from the right source.'], ['Shape', 'Keep two columns, date and value, oldest first, in the format shown here.'], ['Import', 'Use Import Files on the Portfolio Engine page. Files are read in your browser and never uploaded.']]" :key="i" class="rounded-md border p-4">
            <div class="flex items-center gap-2 font-semibold"><span class="inline-grid place-items-center w-6 h-6 rounded-full bg-muted text-xs">{{ i + 1 }}</span>{{ t[0] }}</div>
            <p class="text-sm text-muted-foreground mt-2">{{ t[1] }}</p>
          </li>
        </ol>

        <div class="grid gap-6 md:grid-cols-2 items-start">
          <div class="space-y-2">
            <h3 class="font-semibold">Required file format</h3>
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

    <nav class="flex gap-1 border-b overflow-x-auto overflow-y-hidden" role="tablist">
      <button
        v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="active === t.id"
        class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
        :class="active === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="select(t.id)"
      >{{ t.title }}</button>
    </nav>

    <template v-for="r in regions" :key="r.id">
      <div v-if="active === r.id" class="space-y-8">
        <p class="text-sm text-muted-foreground">{{ r.note }}</p>
        <Card v-for="a in r.assets" :key="a.name" class="bg-card border-border shadow-sm">
          <CardHeader class="pb-2"><CardTitle class="text-xl">{{ a.name }}</CardTitle><CardDescription>Load one or more of these. Each becomes a series you can pick in your portfolio.</CardDescription></CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem v-for="(o, i) in a.options" :key="i" :value="`${a.name}-${i}`">
                <AccordionTrigger class="text-left">
                  <span class="flex items-center gap-3">
                    <Tag :variant="o.type === 'Index' ? 'default' : 'warn'">{{ o.type }}</Tag>
                    <span class="font-medium">{{ o.label }}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div class="grid gap-4 md:grid-cols-2 items-start">
                    <div class="space-y-3">
                      <div class="text-sm font-medium">{{ sources[o.src].title }}</div>
                      <ol class="list-decimal pl-5 space-y-1.5 text-sm">
                        <li v-for="(step, k) in sources[o.src].steps" :key="k">{{ step }}</li>
                      </ol>
                      <p class="text-xs text-muted-foreground">
                        Confirm on import: <strong>{{ sources[o.src].returnType }}</strong>, <strong>{{ sources[o.src].currency }}</strong>.
                      </p>
                    </div>
                    <figure class="space-y-1.5">
                      <img v-if="sources[o.src].gif" :src="`/help/${sources[o.src].gif}`" :alt="`Steps: ${sources[o.src].title}`" class="rounded-md border w-full" />
                      <div v-else class="aspect-video rounded-md border border-dashed bg-muted/40 grid place-items-center text-xs text-muted-foreground text-center p-4">
                        GIF walkthrough goes here<br /><span class="font-mono">/help/{{ o.src }}.gif</span>
                      </div>
                      <figcaption class="text-xs text-muted-foreground">
                        Source:
                        <a v-if="sources[o.src].url" :href="sources[o.src].url" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-foreground">{{ sources[o.src].site }}</a>
                        <span v-else>{{ sources[o.src].site }}</span>
                      </figcaption>
                    </figure>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </template>

    <div v-if="active === 'provided'" class="space-y-8">
      <p class="text-sm text-muted-foreground">Supplied by Xfina, so there is nothing to download. Each one is filled from several sources, oldest first.</p>
      <Card v-for="p in provided" :key="p.name" class="bg-card border-border shadow-sm">
        <CardHeader class="pb-2"><CardTitle class="text-xl">{{ p.name }}</CardTitle><CardDescription>{{ p.use }}</CardDescription></CardHeader>
        <CardContent>
          <ul class="list-disc pl-5 text-sm space-y-1"><li v-for="s in p.sources" :key="s">{{ s }}</li></ul>
        </CardContent>
      </Card>
      <p class="text-sm text-muted-foreground">Need a different source? Import your own USD/INR or inflation file the same way as any other series.</p>
    </div>
  </AppShell>
</template>
