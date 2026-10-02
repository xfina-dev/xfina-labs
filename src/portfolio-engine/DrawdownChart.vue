<script setup>
import { drawdown } from './mockData.js';

const W = 400, H = 170, L = 40, R = 8, T = 8, B = 22;
const min = -0.32;
const sx = (i) => L + (i / (drawdown.length - 1)) * (W - L - R);
const sy = (v) => T + (1 - (v - min) / (0 - min)) * (H - T - B);
const line = drawdown.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
const area = `${line}L${W - R} ${sy(0)}L${L} ${sy(0)}Z`;
const ticks = [0, 1, 2, 3, 4].map((k) => ({ y: T + (1 - k / 4) * (H - T - B), label: `${Math.round((min + (-min * k) / 4) * 100)}%` }));
const years = [2010, 2014, 2018, 2022, 2026].map((y, k) => ({ x: L + (k / 4) * (W - L - R), y }));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="Drawdown">
    <g v-for="t in ticks" :key="t.label">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="L - 5" :y="t.y + 3" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <text v-for="(y, k) in years" :key="y.y" :x="y.x" :y="H - 4" :text-anchor="k === 4 ? 'end' : 'middle'" class="fill-muted-foreground text-[10px]">{{ y.y }}</text>
    <path :d="area" fill="hsl(0 70% 50% / 0.3)" stroke="hsl(0 70% 55%)" />
  </svg>
</template>
