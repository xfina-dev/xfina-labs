<script setup>
import { ref, computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Tag from './Tag.vue';
import Seg from './Seg.vue';
import Field from './Field.vue';
import { ASSETS } from './mockData.js';

const weights = ref(ASSETS.map((a) => a.weight));
const total = computed(() => weights.value.reduce((a, b) => a + Number(b || 0), 0));
const currency = ref('INR');
const capital = ref('₹10,00,000');
const monthly = ref('₹50,000');
</script>

<template>
  <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle>Portfolio</CardTitle>
        <CardDescription>Target weights must total 100%.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
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
        <CardHeader class="pb-4"><CardTitle class="text-xl">Money</CardTitle><CardDescription>Base currency and cash flows.</CardDescription></CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1.5"><div class="text-sm font-medium text-muted-foreground">Base currency</div><Seg v-model="currency" :options="['INR', 'USD']" /></div>
          <div class="grid grid-cols-2 gap-4">
            <Field v-model="capital" label="Starting capital" />
            <Field v-model="monthly" label="Monthly contribution" />
            <Field model-value="10%" disabled><template #label>Growth / yr <Tag variant="soon">later</Tag></template></Field>
            <Field model-value="None" disabled><template #label>Withdrawals <Tag variant="soon">later</Tag></template></Field>
          </div>
          <p class="text-sm text-muted-foreground">Salary model <Tag variant="soon">later</Tag> — an optional cash-flow generator.</p>
        </CardContent>
      </Card>
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4"><CardTitle class="text-xl">Coverage</CardTitle><CardDescription>Common range from your datasets.</CardDescription></CardHeader>
        <CardContent>
          <div class="rounded-md border p-3 font-mono text-sm">2010-01-04 → 2026-09-21</div>
          <p class="text-xs text-muted-foreground mt-3">Limited by Nasdaq 100 (starts 2010). Add an earlier series to extend it.</p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
