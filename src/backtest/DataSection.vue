<script setup>
import { ref } from 'vue';
import { Upload } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Tag from './Tag.vue';
import Field from './Field.vue';
import CoverageChart from './CoverageChart.vue';

const asset = ref('Nasdaq 100');
const representation = ref('Investable proxy (ETF)');
const currency = ref('USD');
const returnType = ref('Total return');

const rows = [
  { asset: 'Nifty 50', series: 'Nifty 50 TRI', tag: 'total return', ccy: 'INR', range: '1999 → 2026', status: ['ok', 'valid'] },
  { asset: 'Nifty Next 50', series: 'Nifty Next 50 TRI', tag: 'total return', ccy: 'INR', range: '2003 → 2026', status: ['ok', 'valid'] },
  { asset: 'Nasdaq 100', series: 'Irish UCITS ETF', tag: 'proxy', tagVariant: 'warn', ccy: 'USD', range: '2010 → 2026', status: ['warn', '2 warnings'], selected: true },
  { asset: 'Gold', ccy: 'INR', status: ['err', 'missing'], upload: true },
  { asset: 'USD/INR', status: ['err', 'missing'], upload: true },
  { asset: 'India CPI', note: 'not needed for nominal returns', status: ['soon', 'later'] },
];

const checks = [
  ['err', 'error', 'None'],
  ['warn', 'warn', '3 gaps longer than 5 trading days (2010-02, 2015-08, 2020-03). Values carried forward; no return is created on those days.'],
  ['warn', 'warn', '1 day-over-day move of +14.2% on 2020-03-24. Plausible; check it against your source.'],
  ['default', 'info', 'Sorted, 0 duplicate dates, all values positive.'],
  ['default', 'info', 'Daily frequency, 4,142 observations, 2010-01-04 → 2026-09-21.'],
];
</script>

<template>
  <div class="space-y-8">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle>Datasets</CardTitle>
        <CardDescription>Download history from the original provider, drop the files here. Files are read and validated locally.</CardDescription>
      </CardHeader>
      <CardContent>
        <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-muted/30">
          <Upload class="h-6 w-6 text-muted-foreground" />
          <span class="text-sm font-semibold">Drop CSV files here, or click to browse</span>
          <span class="text-xs text-muted-foreground">Minimum columns: <code class="font-mono">date,value</code> · one series per file</span>
          <input type="file" accept=".csv" multiple class="sr-only" />
        </label>
      </CardContent>
    </Card>

    <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start">
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4">
          <CardTitle>Datasets in this scenario</CardTitle>
          <CardDescription>Each asset needs a series. A USD series also needs USD/INR.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Asset</TableHead><TableHead>Series</TableHead><TableHead>Ccy</TableHead><TableHead>Range</TableHead><TableHead>Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in rows" :key="r.asset" :class="r.selected && 'bg-muted/50'">
                <TableCell class="font-medium">{{ r.asset }}</TableCell>
                <TableCell>
                  <span v-if="r.series">{{ r.series }} <Tag :variant="r.tagVariant">{{ r.tag }}</Tag></span>
                  <span v-else-if="r.note" class="text-muted-foreground">{{ r.note }}</span>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell>{{ r.ccy || '—' }}</TableCell>
                <TableCell class="font-mono text-xs whitespace-nowrap">{{ r.range || '—' }}</TableCell>
                <TableCell class="whitespace-nowrap">
                  <Tag :variant="r.status[0]">{{ r.status[1] }}</Tag>
                  <Button v-if="r.upload" variant="outline" size="sm" class="ml-2 h-7">Upload</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div>
            <h4 class="font-semibold mb-2">Common date range</h4>
            <CoverageChart />
            <p class="text-xs text-muted-foreground mt-1">Backtests run on the overlap, <span class="font-mono">2010-01-04 → 2026-09-21</span>. No history is extrapolated.</p>
          </div>
        </CardContent>
      </Card>

      <div class="space-y-8">
        <Card class="bg-card border-border shadow-sm">
          <CardHeader class="pb-4">
            <CardTitle class="text-xl">Nasdaq 100 · Irish UCITS ETF</CardTitle>
            <CardDescription class="font-mono text-xs">nasdaq100-ucits.csv · 4,142 rows · read locally</CardDescription>
          </CardHeader>
          <CardContent class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
              <Field v-model="asset" label="Asset" :options="['Nasdaq 100']" />
              <Field v-model="representation" label="Representation" :options="['Investable proxy (ETF)', 'Benchmark index']" />
              <Field v-model="currency" label="Currency" :options="['USD', 'INR']" />
              <Field v-model="returnType" label="Return type" :options="['Total return', 'Adjusted price', 'Price only']" />
            </div>
            <p class="text-xs text-muted-foreground">Return type is never guessed. We suggest a value from the file and ask you to confirm it.</p>
            <div>
              <h4 class="font-semibold mb-2">Quality report <Tag variant="warn">valid with warnings</Tag></h4>
              <ul class="divide-y">
                <li v-for="(c, i) in checks" :key="i" class="flex gap-3 py-2 text-sm">
                  <span class="w-14 shrink-0 pt-0.5"><Tag :variant="c[0]">{{ c[1] }}</Tag></span>
                  <span>{{ c[2] }}</span>
                </li>
              </ul>
            </div>
            <div class="flex gap-2">
              <Button>Use this dataset</Button>
              <Button variant="outline">Replace file</Button>
            </div>
          </CardContent>
        </Card>

        <Card class="bg-card border-border shadow-sm">
          <CardHeader class="pb-2"><CardTitle class="text-xl">How to obtain this dataset</CardTitle></CardHeader>
          <CardContent>
            <Accordion type="single" collapsible default-value="a">
              <AccordionItem value="a" class="border-b-0">
                <AccordionTrigger>Nasdaq 100 (USD, total return)</AccordionTrigger>
                <AccordionContent>
                  <div class="text-sm text-muted-foreground space-y-1">
                    <p>Source: the index or ETF provider's historical data page.</p>
                    <p>Download: daily NAV / total-return index.</p>
                    <p>Columns: <code class="font-mono">date,value</code> (extra columns ignored). Dates as <code class="font-mono">YYYY-MM-DD</code>.</p>
                    <p class="text-xs pt-1">Xfina does not host or redistribute provider data.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
