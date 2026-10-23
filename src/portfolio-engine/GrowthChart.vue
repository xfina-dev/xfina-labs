<script setup>
import { computed } from 'vue';

// Each year's end: money invested so far, and the growth on it above (or the loss below), as in the RealValue
// SIP Engine's Investment and Growth chart.
const props = defineProps({
  h: { type: Number, default: 220 }, // viewBox height: FitChart sets it to fill the room the chart has
  rows: { type: Array, required: true }, // [{ year, invested, growth }]
});

const W = 640, L = 52, R = 0, T = 8, B = 22;
const max = computed(() => Math.max(...props.rows.map((r) => r.invested + Math.max(0, r.growth))) * 1.05);
const band = computed(() => (W - L - R) / props.rows.length);
const bx = (i) => L + i * band.value + band.value * 0.15;
const bw = computed(() => band.value * 0.7);
const sy = (v) => T + (1 - v / max.value) * (props.h - T - B);
const crore = (x) => (x === 0 ? '₹0' : x >= 1e7 ? `₹${(x / 1e7).toFixed(x >= 1e8 ? 0 : 1)} Cr` : `₹${Math.round(x / 1e5)} L`);
const ticks = computed(() => [0, 1, 2, 3, 4].map((k) => ({ y: T + (1 - k / 4) * (props.h - T - B), label: crore((max.value * k) / 4) })));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${h}`" class="block h-full w-full" role="img" aria-label="Money invested and growth at each year's end">
    <g v-for="t in ticks" :key="t.y">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="0" :y="t.y + 3" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <g v-for="(r, i) in rows" :key="r.year">
      <!-- A loss shows in red over the part of the invested bar it ate -->
      <rect :x="bx(i)" :width="bw" :y="sy(r.invested)" :height="sy(0) - sy(r.invested)" class="fill-muted-foreground/40" />
      <rect v-if="r.growth >= 0" :x="bx(i)" :width="bw" :y="sy(r.invested + r.growth)" :height="sy(r.invested) - sy(r.invested + r.growth)" fill="hsl(var(--chart-1))" />
      <rect v-else :x="bx(i)" :width="bw" :y="sy(r.invested)" :height="sy(r.invested + r.growth) - sy(r.invested)" class="fill-status-critical/60" />
      <text v-if="(i % 3 === 0 && i < rows.length - 2) || i === rows.length - 1" :x="bx(i) + bw / 2" :y="h - 4" text-anchor="middle" class="fill-muted-foreground text-[10px]">{{ r.year }}</text>
    </g>
  </svg>
</template>
