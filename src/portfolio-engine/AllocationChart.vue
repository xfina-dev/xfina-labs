<script setup>
import { ASSETS, allocation } from './mockData.js';

const W = 400, H = 170, L = 40, R = 8, T = 8, B = 22;
const pts = allocation();
const n = pts.length;
const sx = (i) => L + (i / (n - 1)) * (W - L - R);
const sy = (v) => T + (1 - v) * (H - T - B);
const cum = (p, k) => p.slice(0, k).reduce((a, b) => a + b, 0);
// One band per asset, drawn top edge left→right then bottom edge right→left.
const bands = ASSETS.map((a, k) => {
  const top = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i)} ${sy(cum(p, k + 1))}`).join('');
  const bot = pts.map((_, i) => `L${sx(n - 1 - i)} ${sy(cum(pts[n - 1 - i], k))}`).join('');
  return { d: `${top}${bot}Z`, color: a.color, opacity: 0.85 - k * 0.08 };
}).reverse();
const ticks = [0, 1, 2, 3, 4].map((k) => ({ y: T + (1 - k / 4) * (H - T - B), label: `${k * 25}%` }));
const years = [2010, 2014, 2018, 2022, 2026].map((y, k) => ({ x: L + (k / 4) * (W - L - R), y }));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="Allocation over time">
    <g v-for="t in ticks" :key="t.label">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="L - 5" :y="t.y + 3" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <path v-for="(b, i) in bands" :key="i" :d="b.d" :fill="`hsl(var(--${b.color}) / ${b.opacity})`" />
    <text v-for="(y, k) in years" :key="y.y" :x="y.x" :y="H - 4" :text-anchor="k === 4 ? 'end' : 'middle'" class="fill-muted-foreground text-[10px]">{{ y.y }}</text>
  </svg>
</template>
