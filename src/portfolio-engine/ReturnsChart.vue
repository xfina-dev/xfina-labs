<script setup>
import { computed } from 'vue';

// XIRR and CAGR side by side, each nominal and real: the gap between a pair is what inflation took. The unit
// chosen at the top is drawn solid, the other faint.
const props = defineProps({
  rows: { type: Array, required: true }, // [{ label: [line, …], nominal, real }]
  real: { type: Boolean, default: false },
});

const W = 320, H = 200, L = 0, R = 0, T = 16, B = 30;
const max = computed(() => Math.max(...props.rows.flatMap((r) => [r.nominal, r.real])) * 1.15);
const sy = (v) => T + (1 - Math.max(0, v) / max.value) * (H - T - B);
const band = computed(() => (W - L - R) / props.rows.length);
const bw = computed(() => band.value * 0.3);
const bx = (i, k) => L + i * band.value + band.value * 0.18 + k * (bw.value + band.value * 0.04);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const bars = computed(() => props.rows.flatMap((r, i) => [
  { x: bx(i, 0), v: r.nominal, name: 'nominal', on: !props.real },
  { x: bx(i, 1), v: r.real, name: 'real', on: props.real },
]));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="XIRR and CAGR, nominal and real">
    <line :x1="L" :x2="W - R" :y1="sy(0)" :y2="sy(0)" class="stroke-border" />
    <g v-for="(b, k) in bars" :key="k">
      <rect :x="b.x" :width="bw" :y="sy(b.v)" :height="sy(0) - sy(b.v)" fill="hsl(var(--chart-1))" :fill-opacity="b.on ? 1 : 0.35" />
      <text :x="b.x + bw / 2" :y="sy(b.v) - 5" text-anchor="middle" class="text-[10px] tabular-nums" :class="b.on ? 'fill-foreground font-semibold' : 'fill-muted-foreground'">{{ pct(b.v) }}</text>
      <text :x="b.x + bw / 2" :y="sy(0) + 11" text-anchor="middle" class="fill-muted-foreground text-[9px]">{{ b.name }}</text>
    </g>
    <text v-for="(r, i) in rows" :key="i" :x="L + (i + 0.5) * band" :y="H - 4" text-anchor="middle" class="fill-foreground text-[10px] font-medium">{{ r.label }}</text>
  </svg>
</template>
