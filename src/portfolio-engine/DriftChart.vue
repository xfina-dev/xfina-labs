<script setup>
import { computed } from 'vue';
import { ASSETS } from './mockData.js';

// Drift from the targets over time: each asset's weight less its target as a thin line (above zero when
// overweight), and the total drift, the sum of the overweights, as the filled area. Dashed lines mark the
// strategy's limits where it has them (Perpetual's sell level in red and stop level in green, Threshold's
// absolute band). Series can be hidden; the axis fits what is shown.
const props = defineProps({
  h: { type: Number, default: 220 }, // viewBox height: FitChart sets it to fill the room the chart has
  rows: { type: Array, required: true }, // [{ drift: [per asset], total }]
  startYear: { type: Number, required: true },
  step: { type: Number, default: 1 }, // months per point
  limits: { type: Array, default: () => [] }, // [{ value, label, tone: 'critical' | 'good', below? }]: label above its line, or below
  hidden: { type: Array, default: () => [] }, // names of the assets not drawn
  showTotal: { type: Boolean, default: true },
});

const W = 640, L = 44, R = 0, T = 8, B = 22;
const n = computed(() => props.rows.length);
// The axis runs in round steps (1, 2, 5 or 10%), at most six of them, from the lowest drift to the highest.
const shown = computed(() => ASSETS.map((a, k) => (props.hidden.includes(a.name) ? -1 : k)).filter((k) => k >= 0));
const visible = computed(() => props.rows.flatMap((r) => [...shown.value.map((k) => r.drift[k]), ...(props.showTotal ? [r.total] : [])]));
const top = computed(() => Math.max(0.02, ...visible.value, ...props.limits.map((l) => l.value)) * 1.08);
const bottom = computed(() => Math.min(-0.02, ...visible.value, ...props.limits.map((l) => l.value)) * 1.08);
const tick = computed(() => [0.01, 0.02, 0.05, 0.1].find((t) => (top.value - bottom.value) / t <= 6) ?? 0.2);
const hi = computed(() => Math.ceil(top.value / tick.value) * tick.value);
const lo = computed(() => Math.floor(bottom.value / tick.value) * tick.value);
const sx = (i) => L + (i / Math.max(1, n.value - 1)) * (W - L - R);
const sy = (v) => T + ((hi.value - v) / (hi.value - lo.value)) * (props.h - T - B);
const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
const total = computed(() => path(props.rows.map((r) => r.total)));
const area = computed(() => `${total.value}L${sx(n.value - 1)} ${sy(0)}L${sx(0)} ${sy(0)}Z`);
const lines = computed(() => shown.value.map((k) => ({ color: ASSETS[k].color, d: path(props.rows.map((r) => r.drift[k])) })));
const ticks = computed(() => Array.from({ length: Math.round((hi.value - lo.value) / tick.value) + 1 }, (_, k) => {
  const v = lo.value + k * tick.value;
  return { y: sy(v), label: `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v * 100).toFixed(0)}%` };
}));
const years = computed(() => [0, 1, 2, 3, 4].map((k) => ({ x: L + (k / 4) * (W - L - R), y: props.startYear + Math.floor((Math.round(((n.value - 1) * k) / 4) * props.step) / 12) })));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${h}`" class="block h-full w-full" role="img" aria-label="Drift from the target allocation over time">
    <g v-for="t in ticks" :key="t.label">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="0" :y="t.y + 3" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <line :x1="L" :x2="W - R" :y1="sy(0)" :y2="sy(0)" class="stroke-muted-foreground" />
    <path v-if="showTotal" :d="area" class="fill-foreground/10" />
    <path v-for="(l, k) in lines" :key="k" :d="l.d" fill="none" :stroke="`hsl(var(--${l.color}))`" stroke-width="1" stroke-opacity="0.8" />
    <path v-if="showTotal" :d="total" fill="none" class="stroke-foreground" stroke-width="2" />
    <g v-for="l in limits" :key="l.label">
      <line :x1="L" :x2="W - R" :y1="sy(l.value)" :y2="sy(l.value)" :class="l.tone === 'good' ? 'stroke-status-good' : 'stroke-status-critical'" :stroke-dasharray="l.tone === 'good' ? '2 3' : '6 4'" stroke-width="1.5" />
      <text :x="W - R" :y="sy(l.value) + (l.below ? 12 : -4)" text-anchor="end" class="text-[10px] font-medium" :class="l.tone === 'good' ? 'fill-status-good-text' : 'fill-status-critical-text'">{{ l.label }}</text>
    </g>
    <text v-for="(y, k) in years" :key="k" :x="y.x" :y="h - 4" :text-anchor="k === 4 ? 'end' : k === 0 ? 'start' : 'middle'" class="fill-muted-foreground text-[10px]">{{ y.y }}</text>
  </svg>
</template>
