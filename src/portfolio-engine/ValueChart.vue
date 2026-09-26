<script setup>
import { computed } from 'vue';
import { value, invested, rebalanceAt } from './mockData.js';

const W = 640, H = 220, L = 46, R = 10, T = 8, B = 22;
const max = Math.max(...value) * 1.05;
const sx = (i) => L + (i / (value.length - 1)) * (W - L - R);
const sy = (v) => T + (1 - v / max) * (H - T - B);
const line = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
const ticks = [0, 1, 2, 3, 4].map((k) => ({ y: T + (1 - k / 4) * (H - T - B), label: `₹${Math.round((max * k) / 4)}L` }));
const years = [2010, 2014, 2018, 2022, 2026].map((y, k) => ({ x: L + (k / 4) * (W - L - R), y }));
const path = computed(() => line(value));
const invPath = computed(() => line(invested));
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="Portfolio value over time">
    <g v-for="t in ticks" :key="t.label">
      <line :x1="L" :x2="W - R" :y1="t.y" :y2="t.y" class="stroke-border" />
      <text :x="L - 6" :y="t.y + 3" text-anchor="end" class="fill-muted-foreground text-[10px]">{{ t.label }}</text>
    </g>
    <text v-for="(y, k) in years" :key="y.y" :x="y.x" :y="H - 4" :text-anchor="k === 4 ? 'end' : 'middle'" class="fill-muted-foreground text-[10px]">{{ y.y }}</text>
    <path :d="invPath" fill="none" class="stroke-muted-foreground" stroke-width="1.5" stroke-dasharray="4 3" />
    <path :d="path" fill="none" stroke="hsl(var(--chart-1))" stroke-width="2" />
    <circle v-for="i in rebalanceAt" :key="i" :cx="sx(i)" :cy="sy(value[i])" r="3.5" fill="hsl(var(--chart-3))" />
  </svg>
</template>
