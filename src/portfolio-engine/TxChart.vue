<script setup>
import { computed } from 'vue';

// Money moved per period, by asset: purchases stacked above the line, rebalancing sales below it.
const props = defineProps({
  h: { type: Number, default: 220 }, // viewBox height: FitChart sets it to fill the room the chart has
  rows: { type: Array, required: true }, // [{ label, assets: [{ color, bought, sold }] }]
});

const W = 640, L = 52, R = 0, T = 8, B = 22;
const up = computed(() => Math.max(1, ...props.rows.map((r) => r.assets.reduce((n, x) => n + x.bought, 0))));
const down = computed(() => Math.max(0, ...props.rows.map((r) => r.assets.reduce((n, x) => n + x.sold, 0))));
// Zero sits where the purchases' and sales' scales meet, with a little room below even when nothing sold.
const span = computed(() => (up.value + Math.max(down.value, up.value * 0.08)) * 1.05);
const zero = computed(() => T + (up.value * 1.05 / span.value) * (props.h - T - B));
const px = (v) => (v / span.value) * (props.h - T - B);
const band = computed(() => (W - L - R) / props.rows.length);
const bx = (i) => L + i * band.value + band.value * 0.12;
const bw = computed(() => Math.max(0.6, band.value * 0.76));
const stack = (parts, key, dir) => {
  let at = zero.value;
  return parts.filter((p) => p[key] > 0).map((p) => {
    const h = px(p[key]);
    const y = dir > 0 ? at - h : at;
    at = dir > 0 ? at - h : at + h;
    return { y, h, color: p.color };
  });
};
const money = (x) => (x >= 1e7 ? `₹${(x / 1e7).toFixed(1)} Cr` : `₹${Math.round(x / 1e5)} L`);
const labelEvery = computed(() => Math.ceil(props.rows.length / 8));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${h}`" class="block h-full w-full" role="img" aria-label="Purchases and rebalancing sales by period and asset">
    <line :x1="L" :x2="W - R" :y1="zero" :y2="zero" class="stroke-muted-foreground" />
    <text :x="0" :y="T + 8" class="fill-muted-foreground text-[10px]">{{ money(up) }}</text>
    <text :x="0" :y="zero + 3" class="fill-muted-foreground text-[10px]">₹0</text>
    <text v-if="down" :x="0" :y="zero + px(down)" class="fill-muted-foreground text-[10px]">−{{ money(down) }}</text>
    <g v-for="(r, i) in rows" :key="r.label">
      <rect v-for="(s, k) in stack(r.assets, 'bought', 1)" :key="'b' + k" :x="bx(i)" :width="bw" :y="s.y" :height="s.h" :fill="`hsl(var(--${s.color}))`" />
      <rect v-for="(s, k) in stack(r.assets, 'sold', -1)" :key="'s' + k" :x="bx(i)" :width="bw" :y="s.y" :height="s.h" :fill="`hsl(var(--${s.color}) / 0.55)`" />
      <text v-if="i % labelEvery === 0" :x="bx(i) + bw / 2" :y="h - 4" text-anchor="middle" class="fill-muted-foreground text-[10px]">{{ r.label.slice(0, 4) }}</text>
    </g>
  </svg>
</template>
