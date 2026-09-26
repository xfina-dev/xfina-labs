<script setup>
import { ref, computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Tag from './Tag.vue';
import Field from './Field.vue';
import { ASSETS } from './mockData.js';

const weights = ref(ASSETS.map((a) => a.weight));
const total = computed(() => weights.value.reduce((a, b) => a + Number(b || 0), 0));
// Same inputs as the RealValue SIP engine on sakthipriyan.com: lumpsum, monthly investment, yearly hike, contribution period.
const lumpsum = ref('₹10,00,000');
const monthly = ref('₹50,000');
const hike = ref('10%');
const period = ref('Whole period');
</script>

<template>
  <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle>Portfolio</CardTitle>
        <CardDescription>Target weights must total 100%.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="rounded-md border p-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div><span class="text-sm text-muted-foreground">Data range</span> <span class="font-mono text-sm ml-2">2010-01-04 → 2026-09-21</span></div>
          <span class="text-xs text-muted-foreground">Limited by Nasdaq 100 (starts 2010). Add an earlier series to extend it.</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Asset</TableHead><TableHead>Series used</TableHead><TableHead class="w-[22%]">Weight</TableHead><TableHead class="w-24 text-right">%</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(a, i) in ASSETS" :key="a.name">
              <TableCell class="font-medium whitespace-nowrap"><i class="inline-block w-2.5 h-2.5 rounded-sm mr-2" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</TableCell>
              <TableCell>{{ a.series }} <Tag :variant="a.kind === 'proxy' ? 'warn' : 'default'">{{ a.kind }}</Tag></TableCell>
              <TableCell><div class="h-2 rounded-full bg-muted overflow-hidden"><div class="h-full" :style="{ width: `${weights[i] * 2}%`, background: `hsl(var(--${a.color}))` }" /></div></TableCell>
              <TableCell class="text-right"><Input v-model="weights[i]" class="h-8 w-20 ml-auto text-right" /></TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colspan="3" class="font-semibold">Total</TableCell>
              <TableCell class="text-right font-semibold">{{ total.toFixed(1) }} <Tag :variant="total === 100 ? 'ok' : 'err'">{{ total === 100 ? 'ok' : 'not 100' }}</Tag></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <div class="flex gap-2"><Button variant="outline" size="sm">+ Add asset</Button><Button variant="outline" size="sm">Equal weight</Button></div>
        <p class="text-xs text-muted-foreground"><Tag>benchmark</Tag> is an index. <Tag variant="warn">proxy</Tag> is the fund or ETF you could have held. They are not the same; results differ by fees and tracking.</p>
      </CardContent>
    </Card>

    <div class="space-y-8">
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4"><CardTitle class="text-xl">Monthly Investment</CardTitle><CardDescription>What you start with and what you add each month.</CardDescription></CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <Field v-model="lumpsum" label="Lumpsum" />
            <Field v-model="monthly" label="Monthly investment" />
            <Field v-model="hike" label="Yearly hike" />
            <Field v-model="period" label="Contribution period" :options="['Whole period', '10 years', '15 years', '20 years']" />
          </div>
          <p class="text-xs text-muted-foreground">Investments start on the first day of the data range. Salary model <Tag variant="soon">later</Tag>.</p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
