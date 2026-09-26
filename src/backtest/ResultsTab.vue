<script setup>
import { ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Tag from './Tag.vue';
import ValueChart from './ValueChart.vue';
import DrawdownChart from './DrawdownChart.vue';
import AllocationChart from './AllocationChart.vue';
import { ASSETS } from './mockData.js';

const kpis = [
  ['Final value', '₹2.84 Cr'], ['Invested', '₹1.36 Cr'], ['CAGR', '12.8%'], ['XIRR', '13.1%'], ['Volatility', '13.6%'],
  ['Max drawdown', '−27.4%'], ['Sharpe', '0.82'], ['Turnover', '18.3%'],
];
const subs = [['overview', 'Overview'], ['drawdown', 'Drawdown'], ['tx', 'Transactions'], ['compare', 'Comparison'], ['risk', 'Risk', true], ['tax', 'Taxes', true]];
const sub = ref('overview');

const drawdowns = [
  ['1', '2020-01-17', '2020-03-23', '2020-08-11', '−27.4%', '2.2 mo', '4.6 mo'],
  ['2', '2021-11-19', '2022-06-17', '2023-01-06', '−19.8%', '7.0 mo', '6.6 mo'],
  ['3', '2015-03-04', '2016-02-29', '2016-10-21', '−14.1%', '11.8 mo', '7.7 mo'],
];
const ledger = [
  ['2024-01-01', 'Contribution', '—', '50,000', 'monthly'],
  ['2024-01-01', 'Buy', 'Nifty 50', '20,000', 'to target'],
  ['2024-01-01', 'Buy', 'Nasdaq 100', '20,000', 'to target'],
  ['2024-01-01', 'Buy', 'Gold', '5,000', 'to target'],
  ['2024-01-01', 'Buy', 'Debt', '5,000', 'to target'],
  ['2024-03-14', 'Rebalance', 'Nasdaq 100', '−3,42,180', '45.2% > 45% band'],
  ['2024-03-14', 'Rebalance', 'Gold', '+1,71,090', 'to target'],
];
const compare = [
  ['Final value', '₹2.91 Cr', '₹2.80 Cr', '₹2.84 Cr'], ['CAGR', '13.1%', '12.6%', '12.8%'], ['Volatility', '15.2%', '13.1%', '13.6%'],
  ['Max drawdown', '−31.0%', '−26.2%', '−27.4%'], ['Sharpe', '0.79', '0.83', '0.82'], ['Turnover', '0%', '21.4%', '18.3%'], ['Trades', '0', '68', '41'],
];
</script>

<template>
  <div class="space-y-8">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="flex flex-row items-start justify-between space-y-0 pb-4">
        <div class="space-y-1.5">
          <CardTitle class="text-xl">Threshold ±5pp · India 40 / Nasdaq 40 / Gold 10 / Debt 10</CardTitle>
          <CardDescription class="font-mono text-xs">2010-01-04 → 2026-09-21 · INR · benchmark realism</CardDescription>
        </div>
        <div class="flex gap-2"><Button variant="outline">Edit</Button><Button>Run again</Button></div>
      </CardHeader>
    </Card>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <div v-for="[l, v] in kpis" :key="l" class="rounded-lg border bg-card shadow-sm p-4">
        <div class="text-sm text-muted-foreground">{{ l }}</div>
        <div class="text-2xl font-semibold tracking-tight tabular-nums">{{ v }}</div>
      </div>
      <div class="rounded-lg border bg-card shadow-sm p-4">
        <div class="text-sm text-muted-foreground">Tax paid</div>
        <div class="text-2xl font-semibold text-muted-foreground">— <Tag variant="soon">later</Tag></div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button v-for="[id, label, off] in subs" :key="id" :variant="sub === id ? 'default' : 'outline'" size="sm" class="rounded-full" :disabled="off" @click="sub = id">
        {{ label }} <Tag v-if="off" variant="soon" class="ml-1.5">later</Tag>
      </Button>
    </div>

    <div v-if="sub === 'overview'" class="space-y-8">
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4"><CardTitle class="text-xl">Portfolio value</CardTitle></CardHeader>
        <CardContent>
          <ValueChart />
          <div class="flex flex-wrap gap-4 text-xs mt-2">
            <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style="background:hsl(var(--chart-1))" />Portfolio value</span>
            <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 bg-muted-foreground" />Invested capital</span>
            <span><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style="background:hsl(var(--chart-3))" />Rebalance</span>
          </div>
        </CardContent>
      </Card>
      <div class="grid gap-8 md:grid-cols-2">
        <Card class="bg-card border-border shadow-sm"><CardHeader class="pb-4"><CardTitle class="text-xl">Drawdown</CardTitle></CardHeader><CardContent><DrawdownChart /></CardContent></Card>
        <Card class="bg-card border-border shadow-sm">
          <CardHeader class="pb-4"><CardTitle class="text-xl">Allocation over time</CardTitle></CardHeader>
          <CardContent>
            <AllocationChart />
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
              <span v-for="a in ASSETS" :key="a.name"><i class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <Card v-if="sub === 'drawdown'" class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4"><CardTitle class="text-xl">Largest drawdowns</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Peak</TableHead><TableHead>Trough</TableHead><TableHead>Recovered</TableHead><TableHead class="text-right">Depth</TableHead><TableHead class="text-right">Peak → trough</TableHead><TableHead class="text-right">Recovery</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="d in drawdowns" :key="d[0]">
              <TableCell>{{ d[0] }}</TableCell><TableCell class="font-mono text-xs">{{ d[1] }}</TableCell><TableCell class="font-mono text-xs">{{ d[2] }}</TableCell><TableCell class="font-mono text-xs">{{ d[3] }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ d[4] }}</TableCell><TableCell class="text-right">{{ d[5] }}</TableCell><TableCell class="text-right">{{ d[6] }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card v-if="sub === 'tx'" class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Transaction ledger</CardTitle>
        <CardDescription>Every simulated trade. The base for turnover, XIRR and later tax.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Event</TableHead><TableHead>Asset</TableHead><TableHead class="text-right">Amount (₹)</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="(t, i) in ledger" :key="i">
              <TableCell class="font-mono text-xs">{{ t[0] }}</TableCell><TableCell>{{ t[1] }}</TableCell><TableCell>{{ t[2] }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ t[3] }}</TableCell><TableCell class="text-muted-foreground">{{ t[4] }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Button variant="outline" size="sm">Export transactions.csv</Button>
      </CardContent>
    </Card>

    <Card v-if="sub === 'compare'" class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Compare strategies on the same data</CardTitle>
        <CardDescription>Measurements, not a ranking. Nothing here is marked as best.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead /><TableHead class="text-right">Buy &amp; hold</TableHead><TableHead class="text-right">Annual</TableHead><TableHead class="text-right">Threshold ±5pp</TableHead><TableHead class="text-right">Perpetual <Tag variant="soon">later</Tag></TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="c in compare" :key="c[0]">
              <TableCell class="font-medium">{{ c[0] }}</TableCell>
              <TableCell v-for="v in c.slice(1)" :key="v" class="text-right tabular-nums">{{ v }}</TableCell>
              <TableCell class="text-right text-muted-foreground">—</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4"><CardTitle class="text-xl">Reproducibility</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        <div class="font-mono text-xs text-muted-foreground leading-relaxed">
          engine 0.1.0 (xfingine) · config sha256 9f3a…c21e · nifty50-tri.csv sha256 41bd…07aa · nasdaq100-ucits.csv sha256 c8e0…5d13
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">Export config (.json)</Button><Button variant="outline" size="sm">Export results (.json)</Button><Button variant="outline" size="sm">Export transactions (.csv)</Button>
        </div>
        <p class="text-xs text-muted-foreground">Same data + same config + same engine version gives the same result. Historical results are not a forecast.</p>
      </CardContent>
    </Card>
  </div>
</template>
