<script setup>
import { ref, reactive, computed } from 'vue';
import { Upload, HelpCircle, ChevronRight, Plus } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Tag from './Tag.vue';
import Field from './Field.vue';
import HelpDataDialog from './HelpDataDialog.vue';

const END = '2026-09-21';
const day = (d) => new Date(d).getTime() / 86400000;

// An asset can be represented by several series: the index, an ETF, a mutual fund, whatever the
// user loads. `since` is where the asset's full history begins; a series is "loaded" for the part
// of [since, END] it covers. A combined series lists its sources oldest first, and the small gap
// where one hands over to the next is carried forward, not counted as missing.
const ix = (name, file, from, extra = {}) => ({ name, type: 'Index', file, from, to: END, ret: 'Total return', status: ['ok', 'valid'], ...extra });
const etf = (name, file, from, extra = {}) => ({ name, type: 'ETF', file, from, to: END, ret: 'Total return', status: ['ok', 'valid'], ...extra });
const mf = (name, file, from, extra = {}) => ({ name, type: 'MF', file, from, to: END, ret: 'Adjusted price', status: ['ok', 'valid'], ...extra });

const sections = [
  {
    id: 'india', title: 'India', note: 'INR assets',
    assets: [
      { name: 'Nifty 50', since: '1999-06-30', series: [ix('Nifty 50 TRI', 'nifty50-tri.csv', '1999-06-30'), etf('NIFTYBEES', 'niftybees.csv', '2002-01-08'), mf('Nifty 50 index fund (Direct)', 'nifty50-index-fund.csv', '2013-01-01')] },
      { name: 'Nifty Next 50', since: '2003-01-01', series: [ix('Nifty Next 50 TRI', 'nifty-next-50-tri.csv', '2003-01-01')] },
      { name: 'Nifty Midcap 150', since: '2005-04-01', series: [ix('Nifty Midcap 150 TRI', 'nifty-midcap-150-tri.csv', '2005-04-01')] },
      { name: 'Nifty Smallcap 250', since: '2005-04-01', series: [] },
      { name: 'Gold', since: '2007-03-08', series: [] },
      { name: 'Debt (short duration)', since: '2005-01-01', series: [mf('Liquid fund', 'liquid-fund.csv', '2008-01-01')] },
    ],
  },
  {
    id: 'us', title: 'US', note: 'USD assets, US-listed or Irish UCITS',
    assets: [
      { name: 'S&P 500', since: '1988-01-04', series: [ix('S&P 500 TR', 'sp500-tr.csv', '1988-01-04', { ccy: 'USD' }), etf('S&P 500 UCITS ETF (Irish)', 'sp500-ucits.csv', '2010-05-19', { ccy: 'USD', status: ['warn', '1 warning'] })] },
      { name: 'Nasdaq 100', since: '1999-01-04', series: [ix('Nasdaq 100 TR', 'nasdaq100-tr.csv', '1999-01-04', { ccy: 'USD' }), etf('Nasdaq 100 UCITS ETF (Irish)', 'nasdaq100-ucits.csv', '2010-01-04', { ccy: 'USD', status: ['warn', '2 warnings'], detail: 'nasdaq' })] },
      { name: 'Debt (0–1 year Treasury)', since: '2007-01-01', series: [etf('Treasury 0–1 year ETF', 'ust-0-1.csv', '2007-05-30', { ccy: 'USD' })] },
      { name: 'Gold', since: '2004-11-18', series: [] },
    ],
  },
  {
    id: 'global', title: 'Global', note: 'USD assets',
    assets: [
      { name: 'MSCI World', since: '1999-01-04', series: [ix('MSCI World NR', 'msci-world.csv', '1999-01-04', { ccy: 'USD' })] },
      { name: 'MSCI Emerging Markets', since: '1999-01-04', series: [] },
      { name: 'MSCI ACWI', since: '2001-01-02', series: [] },
    ],
  },
  {
    id: 'provided', title: 'Provided', note: 'Supplied by Xfina, nothing to import',
    assets: [
      { name: 'USD/INR', since: '1990-01-01', series: [{ name: 'BIS + SBI TT rates', type: 'Provided', origin: 'provided', ccy: 'USD → INR', segments: [{ src: 'BIS', from: '1990-01-01', to: '2019-12-31' }, { src: 'SBI', from: '2020-01-04', to: END }], status: ['ok', 'provided'], note: 'BIS pre-fills the history before SBI card rates begin on 2020-01-04. Used to convert USD series to INR.' }] },
      { name: 'Inflation', since: '1960-01-01', series: [{ name: 'World Bank + MoSPI CPI', type: 'Provided', origin: 'provided', ccy: 'INR', segments: [{ src: 'World Bank', from: '1960-01-01', to: '2012-12-31' }, { src: 'MoSPI', from: '2013-01-01', to: END }], status: ['ok', 'provided'], note: 'World Bank pre-fills the years before MoSPI CPI starts in 2013-01. Monthly, latest month Jun 2026, carried forward to the end date.' }] },
    ],
  },
];

const checks = {
  nasdaq: [
    ['warn', 'warn', '3 gaps longer than 5 trading days (2010-02, 2015-08, 2020-03). Values carried forward; no return is created on those days.'],
    ['warn', 'warn', '1 day-over-day move of +14.2% on 2020-03-24. Plausible; check it against your source.'],
    ['default', 'info', 'Sorted, 0 duplicate dates, all values positive.'],
    ['default', 'info', 'Daily frequency, 4,142 observations, 2010-01-04 → 2026-09-21.'],
  ],
  ok: [
    ['default', 'info', 'Sorted, 0 duplicate dates, all values positive.'],
    ['default', 'info', 'Daily frequency, no gaps longer than 5 trading days.'],
  ],
};

// Share of the asset's full history this series covers, as a whole percent.
function loaded(asset, s) {
  const segs = s.segments || [{ from: s.from, to: s.to }];
  const from = day(asset.since), to = day(END);
  const span = to - from;
  if (!(span > 0)) return 0;
  const first = Math.min(...segs.map((x) => day(x.from)));
  const last = Math.max(...segs.map((x) => day(x.to)));
  return Math.min(100, Math.floor((Math.max(0, Math.min(to, last) - Math.max(from, first)) / span) * 100));
}
const startOf = (s) => (s.segments ? s.segments[0].from : s.from);

// Flatten sections → assets → series into the rows the table draws.
const region = ref('india');
const regions = sections.filter((s) => s.id !== 'provided');
const current = computed(() => regions.find((s) => s.id === region.value));
const ready = (sec) => sec.assets.filter((a) => a.series.some((s) => loaded(a, s) === 100)).length;

const rows = computed(() => {
  const out = [];
  for (const sec of [current.value, sections.find((s) => s.id === 'provided')]) {
    // Regions are chosen with the tabs, so only the Provided block needs its own heading.
    if (sec.id === 'provided') out.push({ kind: 'section', key: `s:${sec.id}`, sec });
    for (const a of sec.assets) {
      out.push({ kind: 'asset', key: `a:${sec.id}:${a.name}`, a });
      if (!a.series.length) out.push({ kind: 'empty', key: `e:${sec.id}:${a.name}`, a });
      for (const s of a.series) out.push({ kind: 'series', key: `r:${sec.id}:${a.name}:${s.name}`, a, s, pct: loaded(a, s) });
    }
  }
  return out;
});

const importable = sections.filter((s) => s.id !== 'provided').flatMap((s) => s.assets);
const assetsReady = computed(() => importable.filter((a) => a.series.some((s) => loaded(a, s) === 100)).length);

const expanded = ref(null);
const edit = reactive({ type: '', ccy: '', ret: '' });
function toggle(row) {
  if (expanded.value === row.key) { expanded.value = null; return; }
  expanded.value = row.key;
  edit.type = row.s.type === 'MF' ? 'Mutual fund' : row.s.type;
  edit.ccy = row.s.ccy || 'INR';
  edit.ret = row.s.ret || 'Total return';
}

const fileInput = ref(null);
const pick = () => fileInput.value.click();
</script>

<template>
  <Card class="bg-card border-border shadow-sm">
    <CardHeader class="flex flex-row items-start justify-between space-y-0 gap-4 pb-4">
      <div class="space-y-1.5">
        <CardTitle>Datasets</CardTitle>
        <CardDescription>
          {{ assetsReady }} of {{ importable.length }} assets have a fully loaded series.
        </CardDescription>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-3">
        <HelpDataDialog>
          <Button variant="outline"><HelpCircle class="h-4 w-4 mr-2" />How to get data</Button>
        </HelpDataDialog>
        <Button @click="pick"><Upload class="h-4 w-4 mr-2" />Import Files</Button>
        <input ref="fileInput" type="file" accept=".csv" multiple class="sr-only" />
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex gap-1 border-b overflow-x-auto overflow-y-hidden" role="tablist">
        <button
          v-for="t in regions" :key="t.id" type="button" role="tab" :aria-selected="region === t.id"
          class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
          :class="region === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="region = t.id; expanded = null"
        >{{ t.title }} <span class="ml-1 text-xs font-normal text-muted-foreground">{{ ready(t) }}/{{ t.assets.length }}</span></button>
      </div>
      <p class="text-sm text-muted-foreground">{{ current.note }}</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Series</TableHead>
            <TableHead>Type</TableHead>
            <TableHead class="w-[30%]">Loaded</TableHead>
            <TableHead>Source</TableHead>
            <TableHead class="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-for="r in rows" :key="r.key">
            <!-- Section -->
            <TableRow v-if="r.kind === 'section'" class="hover:bg-transparent">
              <TableCell colspan="5" class="pt-6 pb-2 px-0">
                <span class="text-base font-semibold">{{ r.sec.title }}</span>
                <span class="ml-2 text-sm text-muted-foreground">{{ r.sec.note }}</span>
              </TableCell>
            </TableRow>

            <!-- Asset -->
            <TableRow v-else-if="r.kind === 'asset'" class="bg-muted/30 hover:bg-muted/30">
              <TableCell colspan="4" class="py-2">
                <span class="font-semibold">{{ r.a.name }}</span>
                <span class="ml-2 text-xs text-muted-foreground">full history from <span class="font-mono">{{ r.a.since }}</span></span>
              </TableCell>
              <TableCell class="py-2 text-right" colspan="1">
                <Button v-if="r.a.series.length && r.a.series[0].origin !== 'provided'" variant="ghost" size="sm" class="h-7 px-2 -mr-2" title="Add another series for this asset" @click="pick"><Plus class="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>

            <!-- Nothing loaded for this asset yet -->
            <TableRow v-else-if="r.kind === 'empty'" class="hover:bg-transparent">
              <TableCell colspan="3" class="pl-6 text-muted-foreground">
                <div class="h-2 rounded-full bg-muted mb-1" /> 0% · No series yet
              </TableCell>
              <TableCell colspan="2"><Button variant="outline" size="sm" class="h-7" @click="pick">Import</Button></TableCell>
            </TableRow>

            <!-- Series -->
            <template v-else>
              <TableRow :class="['cursor-pointer', expanded === r.key && 'bg-muted/50']" @click="toggle(r)">
                <TableCell class="pl-6">{{ r.s.name }}</TableCell>
                <TableCell class="whitespace-nowrap"><Tag :variant="r.s.type === 'Index' || r.s.type === 'Provided' ? 'default' : 'warn'">{{ r.s.type }}</Tag></TableCell>
                <TableCell>
                  <div class="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" :aria-valuenow="r.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`${r.s.name} loaded`">
                    <div class="h-full transition-all" :class="r.pct === 100 ? 'bg-[hsl(var(--ok))]' : 'bg-[hsl(var(--warn))]'" :style="{ width: `${r.pct}%` }" />
                  </div>
                  <div class="mt-1 text-xs" :class="r.pct === 100 ? 'text-[hsl(var(--ok))] font-medium' : 'text-muted-foreground'">
                    <template v-if="r.pct === 100">100% · Fully loaded</template>
                    <template v-else>{{ r.pct }}% · starts {{ startOf(r.s) }}</template>
                  </div>
                </TableCell>
                <TableCell class="whitespace-nowrap">
                  <Tag :variant="r.s.origin === 'provided' ? 'default' : r.s.status[0]">{{ r.s.origin === 'provided' ? 'provided' : r.s.status[1] }}</Tag>
                  <span v-if="r.s.file" class="ml-2 text-xs text-muted-foreground font-mono">{{ r.s.file }}</span>
                </TableCell>
                <TableCell class="text-muted-foreground"><ChevronRight class="h-4 w-4 transition-transform" :class="expanded === r.key && 'rotate-90'" /></TableCell>
              </TableRow>

              <TableRow v-if="expanded === r.key" class="hover:bg-transparent">
                <TableCell colspan="5" class="bg-muted/20">
                  <div v-if="r.s.origin === 'provided'" class="space-y-3 py-2">
                    <p class="text-sm text-muted-foreground">{{ r.s.note }}</p>
                    <ul class="text-sm font-mono space-y-1">
                      <li v-for="g in r.s.segments" :key="g.src"><span class="inline-block w-24 font-sans font-medium">{{ g.src }}</span>{{ g.from }} → {{ g.to }}</li>
                    </ul>
                  </div>
                  <div v-else class="grid gap-6 lg:grid-cols-2 py-2">
                    <div class="space-y-4">
                      <div class="grid grid-cols-2 gap-4">
                        <Field :model-value="r.a.name" label="Asset" :options="[r.a.name]" />
                        <Field v-model="edit.type" label="Type" :options="['Index', 'ETF', 'Mutual fund']" />
                        <Field v-model="edit.ccy" label="Currency" :options="['INR', 'USD']" />
                        <Field v-model="edit.ret" label="Return type" :options="['Total return', 'Adjusted price', 'Price only']" />
                      </div>
                      <p class="text-xs text-muted-foreground">Return type and currency are never guessed. We suggest a value from the file and ask you to confirm it.</p>
                      <div class="flex gap-2"><Button size="sm">Use this series</Button><Button variant="outline" size="sm" @click="pick">Replace file</Button></div>
                    </div>
                    <div>
                      <h4 class="font-semibold mb-2">Quality report <Tag :variant="r.s.status[0]">{{ r.s.status[0] === 'ok' ? 'valid' : 'valid with warnings' }}</Tag></h4>
                      <ul class="divide-y">
                        <li v-for="(c, i) in checks[r.s.detail || 'ok']" :key="i" class="flex gap-3 py-2 text-sm">
                          <span class="w-14 shrink-0 pt-0.5"><Tag :variant="c[0]">{{ c[1] }}</Tag></span>
                          <span>{{ c[2] }}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </template>
        </TableBody>
      </Table>

      <p class="text-xs text-muted-foreground">
        Loaded shows how much of an asset's full history a series covers. Files are read and validated in your browser; nothing leaves it.
        Nothing is extrapolated: a run only uses dates every chosen series covers.
      </p>
    </CardContent>
  </Card>
</template>
