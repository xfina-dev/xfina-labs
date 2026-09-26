<script setup>
import { ref, computed } from 'vue';
import { Upload, HelpCircle, ChevronRight } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Tag from './Tag.vue';
import Field from './Field.vue';
import HelpDataDialog from './HelpDataDialog.vue';

// The run window is [startDate, END]. A dataset is "loaded" for the part of that window it covers.
const startDate = ref('2005-01-01');
const END = '2026-09-21';
const day = (d) => new Date(d).getTime() / 86400000;

// Each dataset is one or more source segments. A combined series lists its sources oldest first,
// where the older source pre-fills the history before the newer one starts.
const datasets = [
  { asset: 'Nifty 50', series: 'Nifty 50 TRI', tag: 'total return', ccy: 'INR', origin: 'uploaded', file: 'nifty50-tri.csv', segments: [{ src: 'Upload', from: '1999-06-30', to: END }], status: ['ok', 'valid'] },
  { asset: 'Nifty Next 50', series: 'Nifty Next 50 TRI', tag: 'total return', ccy: 'INR', origin: 'uploaded', file: 'nifty-next-50-tri.csv', segments: [{ src: 'Upload', from: '2003-01-01', to: END }], status: ['ok', 'valid'] },
  { asset: 'Nifty Midcap 150', series: 'Nifty Midcap 150 TRI', tag: 'total return', ccy: 'INR', origin: 'uploaded', file: 'nifty-midcap-150-tri.csv', segments: [{ src: 'Upload', from: '2005-04-01', to: END }], status: ['ok', 'valid'] },
  { asset: 'Nasdaq 100', series: 'Irish UCITS ETF', tag: 'proxy', tagVariant: 'warn', ccy: 'USD', origin: 'uploaded', file: 'nasdaq100-ucits.csv', rows: '4,142', segments: [{ src: 'Upload', from: '2010-01-04', to: END }], status: ['warn', '2 warnings'], detail: 'nasdaq' },
  { asset: 'India debt — short', series: 'Liquid fund', tag: 'proxy', tagVariant: 'warn', ccy: 'INR', origin: 'uploaded', file: 'liquid-fund.csv', segments: [{ src: 'Upload', from: '2008-01-01', to: END }], status: ['ok', 'valid'] },
  { asset: 'Gold', ccy: 'INR', origin: 'uploaded', segments: [], status: ['err', 'missing'] },
  // Provided by Xfina: nothing to download or upload.
  { asset: 'USD/INR', series: 'BIS + SBI TT rates', ccy: 'USD → INR', origin: 'provided', segments: [{ src: 'BIS', from: '1990-01-01', to: '2019-12-31' }, { src: 'SBI', from: '2020-01-04', to: END }], status: ['ok', 'provided'], note: 'BIS pre-fills the history before SBI card rates begin on 2020-01-04. Used to convert USD series to INR.' },
  { asset: 'Inflation', series: 'World Bank + MoSPI CPI', ccy: 'INR', origin: 'provided', segments: [{ src: 'World Bank', from: '1960-01-01', to: '2012-12-31' }, { src: 'MoSPI', from: '2013-01-01', to: END }], status: ['ok', 'provided'], note: 'World Bank pre-fills the years before MoSPI CPI starts in 2013-01. Monthly, latest month Jun 2026, carried forward to the end date.' },
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

// Share of the run window this dataset covers, as a whole percent. A combined series counts as
// continuous from its oldest source to its newest: the small gap where one source hands over
// to the next (a weekend, a month boundary) is carried forward, not treated as missing.
function loaded(d) {
  if (!d.segments.length) return 0;
  const from = day(startDate.value), to = day(END);
  const span = to - from;
  if (!(span > 0)) return 0;
  const first = Math.min(...d.segments.map((s) => day(s.from)));
  const last = Math.max(...d.segments.map((s) => day(s.to)));
  const covered = Math.max(0, Math.min(to, last) - Math.max(from, first));
  return Math.min(100, Math.floor((covered / span) * 100));
}
const firstDate = (d) => d.segments[0]?.from;

const rows = computed(() => datasets.map((d) => ({ ...d, pct: loaded(d) })));
const fully = computed(() => rows.value.filter((r) => r.pct === 100).length);

const expanded = ref(null);
const toggle = (asset) => (expanded.value = expanded.value === asset ? null : asset);

const fileInput = ref(null);
const representation = ref('Investable proxy (ETF)');
const currency = ref('USD');
const returnType = ref('Total return');
</script>

<template>
  <Card class="bg-card border-border shadow-sm">
    <CardHeader class="pb-4">
      <CardTitle>Datasets</CardTitle>
      <CardDescription>Everything the run needs. Uploaded files are read and validated in your browser; nothing leaves it.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-wrap items-end gap-4">
          <Button @click="fileInput.click()"><Upload class="h-4 w-4 mr-2" />Upload CSV</Button>
          <input ref="fileInput" type="file" accept=".csv" multiple class="sr-only" />
          <div class="space-y-1.5">
            <Label class="text-muted-foreground">Start date</Label>
            <Input v-model="startDate" type="date" class="h-9 w-44" />
          </div>
        </div>
        <HelpDataDialog>
          <Button variant="outline"><HelpCircle class="h-4 w-4 mr-2" />How to get data</Button>
        </HelpDataDialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Series</TableHead>
            <TableHead>Ccy</TableHead>
            <TableHead class="w-[26%]">Loaded</TableHead>
            <TableHead>Source</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-for="r in rows" :key="r.asset">
            <TableRow :class="['cursor-pointer', expanded === r.asset && 'bg-muted/50']" @click="r.segments.length && toggle(r.asset)">
              <TableCell class="font-medium whitespace-nowrap">{{ r.asset }}</TableCell>
              <TableCell>
                <span v-if="r.series">{{ r.series }} <Tag v-if="r.tag" :variant="r.tagVariant">{{ r.tag }}</Tag></span>
                <span v-else class="text-muted-foreground">No file yet</span>
              </TableCell>
              <TableCell class="whitespace-nowrap">{{ r.ccy }}</TableCell>
              <TableCell>
                <div class="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" :aria-valuenow="r.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`${r.asset} loaded`">
                  <div class="h-full transition-all" :class="r.pct === 100 ? 'bg-[hsl(var(--ok))]' : 'bg-[hsl(var(--warn))]'" :style="{ width: `${r.pct}%` }" />
                </div>
                <div class="mt-1 text-xs" :class="r.pct === 100 ? 'text-[hsl(var(--ok))] font-medium' : 'text-muted-foreground'">
                  <template v-if="r.pct === 100">100% · Fully loaded</template>
                  <template v-else-if="r.pct === 0">0% · No data</template>
                  <template v-else>{{ r.pct }}% · starts {{ firstDate(r) }}</template>
                </div>
              </TableCell>
              <TableCell class="whitespace-nowrap">
                <Tag :variant="r.origin === 'provided' ? 'default' : r.status[0]">{{ r.origin === 'provided' ? 'provided' : r.status[1] }}</Tag>
                <Button v-if="!r.segments.length" variant="outline" size="sm" class="ml-2 h-7" @click.stop="fileInput.click()">Upload</Button>
                <span v-else-if="r.origin === 'uploaded'" class="ml-2 text-xs text-muted-foreground font-mono">{{ r.file }}</span>
              </TableCell>
              <TableCell class="w-8 text-muted-foreground">
                <ChevronRight v-if="r.segments.length" class="h-4 w-4 transition-transform" :class="expanded === r.asset && 'rotate-90'" />
              </TableCell>
            </TableRow>

            <TableRow v-if="expanded === r.asset" class="hover:bg-transparent">
              <TableCell colspan="6" class="bg-muted/20">
                <div v-if="r.origin === 'provided'" class="space-y-3 py-2">
                  <p class="text-sm text-muted-foreground">{{ r.note }}</p>
                  <ul class="text-sm font-mono space-y-1">
                    <li v-for="s in r.segments" :key="s.src"><span class="inline-block w-24 font-sans font-medium">{{ s.src }}</span>{{ s.from }} → {{ s.to }}</li>
                  </ul>
                </div>
                <div v-else class="grid gap-6 lg:grid-cols-2 py-2">
                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                      <Field :model-value="r.asset" label="Asset" :options="[r.asset]" />
                      <Field v-model="representation" label="Representation" :options="['Investable proxy (ETF)', 'Benchmark index']" />
                      <Field v-model="currency" label="Currency" :options="['USD', 'INR']" />
                      <Field v-model="returnType" label="Return type" :options="['Total return', 'Adjusted price', 'Price only']" />
                    </div>
                    <p class="text-xs text-muted-foreground">Return type is never guessed. We suggest a value from the file and ask you to confirm it.</p>
                    <div class="flex gap-2"><Button size="sm">Use this dataset</Button><Button variant="outline" size="sm" @click="fileInput.click()">Replace file</Button></div>
                  </div>
                  <div>
                    <h4 class="font-semibold mb-2">Quality report <Tag :variant="r.status[0]">{{ r.status[1] === 'valid' ? 'valid' : 'valid with warnings' }}</Tag></h4>
                    <ul class="divide-y">
                      <li v-for="(c, i) in checks[r.detail || 'ok']" :key="i" class="flex gap-3 py-2 text-sm">
                        <span class="w-14 shrink-0 pt-0.5"><Tag :variant="c[0]">{{ c[1] }}</Tag></span>
                        <span>{{ c[2] }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>

      <p class="text-xs text-muted-foreground">
        {{ fully }} of {{ rows.length }} datasets are fully loaded from <span class="font-mono">{{ startDate }}</span>. Nothing is extrapolated: a run only uses dates every dataset covers.
      </p>
    </CardContent>
  </Card>
</template>
