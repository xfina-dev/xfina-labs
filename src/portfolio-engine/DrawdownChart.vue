<script setup>
import { computed } from 'vue';

// How far the return index sits below its last peak, month by month.
const props = defineProps({
  h: { type: Number, default: 220 }, // viewBox height: FitChart sets it to fill the room the chart has
  drawdown: { type: Array, required: true },
  startYear: { type: Number, required: true },
});

const W = 640, L = 44, R = 0, T = 8, B = 22;
const min = computed(() => Math.min(-0.1, Math.floor(Math.min(...props.drawdown) * 10) / 10));
const sx = (i) => L + (i / (props.drawdown.length - 1)) * (W - L - R);
const sy = (v) => T + (1 - (v - min.value) / (0 - min.value)) * (props.h - T - B);
const line = computed(() => props.drawdown.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(''));
const area = computed(() => `${line.value}L${W - R} ${sy(0)}L${L} ${sy(0)}Z`);
const ticks = computed(() => [0, 1, 2, 3, 4].map((k) => ({ y: T + (1 - k / 4) * (props.h - T - B), label: `${Math.round((min.value - (min.value * k) / 4) * 100)}%` })));
// Each tick is labelled with the year of the month it falls on.
const years = computed(() => [0, 1, 2, 3, 4].map((k) => ({ x: L + (k / 4) * (W - L - R), y: props.startYear + Math.floor(Math.round(((props.drawdown.length - 1) * k) / 4) / 12) })));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${h}`" class="block h-full w-full" role="img" aria-label="Drawdown over time">
    <g v-for="t in ticks" :key="t.y">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="0" :y="t.y + 3" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <text v-for="(y, k) in years" :key="k" :x="y.x" :y="h - 4" :text-anchor="k === 4 ? 'end' : k === 0 ? 'start' : 'middle'" class="fill-muted-foreground text-[10px]">{{ y.y }}</text>
    <path :d="area" class="fill-status-critical/25 stroke-status-critical" />
  </svg>
</template>
