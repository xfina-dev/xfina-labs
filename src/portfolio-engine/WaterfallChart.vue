<script setup>
import { computed } from 'vue';

// From the money put in to what is left after tax: totals stand on zero, each change floats from the running
// total (up for growth, down for tax), with a dashed line carrying the total across.
const props = defineProps({
  steps: { type: Array, required: true }, // [{ label: [line, …], value, total? }]
});

const W = 640, H = 200, L = 0, R = 0, T = 16, B = 30;
// Where each bar starts and ends: a total from zero, a change from the running total.
const bars = computed(() => {
  let run = 0;
  return props.steps.map((s) => {
    const from = s.total ? 0 : run;
    const to = s.total ? s.value : run + s.value;
    run = to;
    return { ...s, from, to };
  });
});
const max = computed(() => Math.max(...bars.value.map((b) => Math.max(b.from, b.to))) * 1.08);
const sy = (v) => T + (1 - v / max.value) * (H - T - B);
const band = (W - L - R) / props.steps.length;
const bx = (i) => L + i * band + band * 0.16;
const bw = band * 0.68;
const short = (x) => `${x < 0 ? '−' : ''}₹${Math.abs(x) >= 1e7 ? `${(Math.abs(x) / 1e7).toFixed(2)} Cr` : `${(Math.abs(x) / 1e5).toFixed(1)} L`}`;
const fill = (b) => (b.total ? 'fill-muted-foreground/45' : b.value < 0 ? 'fill-status-critical/60' : '');
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="From money invested to the value after tax">
    <line :x1="L" :x2="W - R" :y1="sy(0)" :y2="sy(0)" class="stroke-border" />
    <g v-for="(b, i) in bars" :key="i">
      <rect
        :x="bx(i)" :width="bw" :y="sy(Math.max(b.from, b.to))" :height="Math.max(1, Math.abs(sy(b.from) - sy(b.to)))"
        :class="fill(b)" :fill="fill(b) ? undefined : 'hsl(var(--chart-1))'"
      />
      <line v-if="i < bars.length - 1" :x1="bx(i) + bw" :x2="bx(i + 1)" :y1="sy(b.to)" :y2="sy(b.to)" class="stroke-muted-foreground" stroke-dasharray="2 2" />
      <text :x="bx(i) + bw / 2" :y="sy(Math.max(b.from, b.to)) - 5" text-anchor="middle" class="text-[10px] tabular-nums" :class="b.total ? 'fill-foreground font-semibold' : 'fill-muted-foreground'">{{ b.total ? short(b.value) : `${b.value < 0 ? '' : '+'}${short(b.value)}` }}</text>
      <text :x="bx(i) + bw / 2" :y="H - B + 13" text-anchor="middle" class="fill-muted-foreground text-[10px]">
        <tspan v-for="(line, k) in b.label" :key="k" :x="bx(i) + bw / 2" :dy="k ? 11 : 0">{{ line }}</tspan>
      </text>
    </g>
  </svg>
</template>
