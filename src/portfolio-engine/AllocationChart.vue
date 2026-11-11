<script setup>
import { computed } from 'vue';
import { seriesMismatch } from './chartSeries.js';

// Each asset's share of the portfolio over time, stacked to 100%: one point per month or per year.
const props = defineProps({
  h: { type: Number, default: 220 }, // viewBox height: FitChart sets it to fill the room the chart has
  points: { type: Array, required: true }, // [[weight per asset, summing to 1], …]
  // The assets of the run being drawn, in the order its weights are in. A stored result is charted as it was
  // run, never as Select Assets happens to be set now.
  // Defaulted rather than required so a caller that forgets it gets the mismatch note below, not a crash.
  assets: { type: Array, default: () => [] }, // [{ name, color }]
  startYear: { type: Number, required: true },
  step: { type: Number, default: 1 }, // months per point
});

const W = 640, L = 44, R = 0, T = 8, B = 22;
const n = computed(() => props.points.length);
const sx = (i) => L + (i / Math.max(1, n.value - 1)) * (W - L - R);
const sy = (v) => T + (1 - v) * (props.h - T - B);
const cum = (p, k) => p.slice(0, k).reduce((a, b) => a + b, 0);
// A point carries one weight per asset of the run that produced it; if it does not, the bands would be fiction.
const mismatch = computed(() => seriesMismatch(props.points.map((p) => p.length), props.assets));
// One band per asset, drawn top edge left→right then bottom edge right→left. Follows the Allocation card's
// colours, weights and order.
const bands = computed(() => (mismatch.value ? [] : props.assets.map((a, k) => {
  const pts = props.points, last = n.value - 1;
  const top = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(cum(p, k + 1)).toFixed(1)}`).join('');
  const bot = pts.map((_, i) => `L${sx(last - i).toFixed(1)} ${sy(cum(pts[last - i], k)).toFixed(1)}`).join('');
  return { d: `${top}${bot}Z`, color: a.color, opacity: 0.85 - k * 0.08 };
}).reverse()));
const ticks = computed(() => [0, 1, 2, 3, 4].map((k) => ({ y: T + (1 - k / 4) * (props.h - T - B), label: `${k * 25}%` })));
// Each tick is labelled with the year of the point it falls on.
const years = computed(() => [0, 1, 2, 3, 4].map((k) => ({ x: L + (k / 4) * (W - L - R), y: props.startYear + Math.floor((Math.round(((n.value - 1) * k) / 4) * props.step) / 12) })));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${h}`" class="block h-full w-full" role="img" aria-label="Allocation over time">
    <text v-if="mismatch" :x="W / 2" :y="h / 2" text-anchor="middle" class="fill-status-critical-text text-[11px]">{{ mismatch }}</text>
    <template v-else>
    <g v-for="t in ticks" :key="t.label">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="0" :y="t.y + 3" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <path v-for="(b, i) in bands" :key="i" :d="b.d" :fill="`hsl(var(--${b.color}) / ${b.opacity})`" />
    <text v-for="(y, k) in years" :key="k" :x="y.x" :y="h - 4" :text-anchor="k === 4 ? 'end' : k === 0 ? 'start' : 'middle'" class="fill-muted-foreground text-[10px]">{{ y.y }}</text>
    </template>
  </svg>
</template>
