<script setup>
import { ref } from 'vue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Tag from './Tag.vue';
import Seg from './Seg.vue';
import Field from './Field.vue';

const strategies = [
  { id: 'hold', name: 'No rebalancing (buy and hold)', desc: 'Set weights once, never trade. Shows how far the portfolio drifts.', tag: 'v1' },
  { id: 'calendar', name: 'Calendar rebalance', desc: 'Restore targets on a schedule: monthly, quarterly, half-yearly or annual.', tag: 'v1' },
  { id: 'threshold', name: 'Threshold rebalance', desc: 'Trade only when an asset drifts past a band around its target.', tag: 'v1' },
  { id: 'perpetual', name: 'Perpetual rebalance', desc: 'Cash-flow driven: buy underweights first, sell only when necessary.', tag: 'later', off: true },
];
const selected = ref('threshold');
const band = ref('Absolute (pp)');
const bandValue = ref('± 5 percentage points');
const check = ref('Daily');
</script>

<template>
  <div class="space-y-8">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle>Rebalancing</CardTitle>
        <CardDescription>Pick how the portfolio is kept on target. You can add several and compare them on the same data.</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4 md:grid-cols-2">
          <button
            v-for="s in strategies" :key="s.id" type="button" :disabled="s.off"
            class="text-left rounded-md border p-4 transition-colors disabled:opacity-55 disabled:cursor-not-allowed"
            :class="selected === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'"
            @click="selected = s.id"
          >
            <div class="flex items-center justify-between font-semibold">{{ s.name }} <Tag :variant="s.off ? 'soon' : 'default'">{{ s.tag }}</Tag></div>
            <p class="text-sm text-muted-foreground mt-1">{{ s.desc }}</p>
          </button>
        </div>
      </CardContent>
    </Card>

    <div class="grid gap-8 md:grid-cols-2 items-start">
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4"><CardTitle class="text-xl">Threshold settings</CardTitle><CardDescription>The two band types are different, so the choice is explicit.</CardDescription></CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1.5"><div class="text-sm font-medium text-muted-foreground">Band type</div><Seg v-model="band" :options="['Absolute (pp)', 'Relative (% of target)']" /></div>
          <Field v-model="bandValue" label="Band" />
          <Field v-model="check" label="Check" :options="['Daily', 'Month-end']" />
        </CardContent>
      </Card>
      <Card class="bg-card border-border shadow-sm">
        <CardHeader class="pb-4"><CardTitle class="text-xl">What this means</CardTitle><CardDescription>For a target of 40%:</CardDescription></CardHeader>
        <CardContent class="space-y-4">
          <svg viewBox="0 0 360 96" class="w-full" aria-label="Band example">
            <rect x="10" y="40" width="340" height="14" rx="7" class="fill-muted" />
            <rect x="130" y="40" width="100" height="14" rx="7" fill="hsl(var(--chart-2) / 0.5)" />
            <line x1="180" x2="180" y1="30" y2="64" class="stroke-foreground" stroke-width="2" />
            <g class="fill-muted-foreground text-[10px]">
              <text x="180" y="22" text-anchor="middle">target 40%</text>
              <text x="130" y="80" text-anchor="middle">35%</text><text x="230" y="80" text-anchor="middle">45%</text>
              <text x="20" y="80">rebalance</text><text x="290" y="80">rebalance</text>
            </g>
          </svg>
          <p class="text-xs text-muted-foreground">Relative ±10% on the same target would be 36%–44%.</p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
