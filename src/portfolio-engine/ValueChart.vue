<script setup>
import { computed } from 'vue';

// Portfolio value against money invested, month by month, with the months a rebalance traded.
const props = defineProps({
  h: { type: Number, default: 220 }, // viewBox height: FitChart sets it to fill the room the chart has
  value: { type: Array, required: true },
  invested: { type: Array, required: true },
  markers: { type: Array, default: () => [] },
  startYear: { type: Number, required: true },
});

const W = 640, L = 52, R = 0, T = 8, B = 22;
const max = computed(() => Math.max(...props.value, ...props.invested) * 1.05);
const sx = (i) => L + (i / (props.value.length - 1)) * (W - L - R);
const sy = (v) => T + (1 - v / max.value) * (props.h - T - B);
const line = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
const crore = (x) => (x === 0 ? '₹0' : x >= 1e7 ? `₹${(x / 1e7).toFixed(x >= 1e8 ? 0 : 1)} Cr` : `₹${Math.round(x / 1e5)} L`);
const ticks = computed(() => [0, 1, 2, 3, 4].map((k) => ({ y: T + (1 - k / 4) * (props.h - T - B), label: crore((max.value * k) / 4) })));
// Each tick is labelled with the year of the month it falls on.
const years = computed(() => [0, 1, 2, 3, 4].map((k) => ({ x: L + (k / 4) * (W - L - R), y: props.startYear + Math.floor(Math.round(((props.value.length - 1) * k) / 4) / 12) })));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${h}`" class="block h-full w-full" role="img" aria-label="Portfolio value and money invested over time">
    <g v-for="t in ticks" :key="t.y">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="0" :y="t.y + 3" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <text v-for="(y, k) in years" :key="k" :x="y.x" :y="h - 4" :text-anchor="k === 4 ? 'end' : k === 0 ? 'start' : 'middle'" class="fill-muted-foreground text-[10px]">{{ y.y }}</text>
    <path :d="line(invested)" fill="none" class="stroke-muted-foreground" stroke-width="1.5" stroke-dasharray="4 3" />
    <path :d="line(value)" fill="none" stroke="hsl(var(--chart-1))" stroke-width="2" />
    <circle v-for="i in markers" :key="i" :cx="sx(i)" :cy="sy(value[i])" r="3" fill="hsl(var(--chart-3))" />
  </svg>
</template>
