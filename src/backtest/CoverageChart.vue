<script setup>
const rows = [['Nifty 50 TRI', 1999.5, 2026.7], ['Nifty Next 50 TRI', 2003.2, 2026.7], ['Nasdaq 100 UCITS', 2010, 2026.7]];
const x = (v) => 120 + ((v - 1999) / (2027 - 1999)) * 510;
const years = [2000, 2005, 2010, 2015, 2020, 2025];
</script>

<template>
  <svg viewBox="0 0 640 132" class="w-full" role="img" aria-label="Date coverage per dataset">
    <g v-for="([name, a, b], i) in rows" :key="name">
      <text x="0" :y="14 + i * 30 + 11" class="fill-muted-foreground text-[11px]">{{ name }}</text>
      <rect :x="x(a)" :y="14 + i * 30" :width="x(b) - x(a)" height="14" rx="4" class="fill-muted-foreground/35" />
    </g>
    <rect :x="x(2010)" y="6" :width="x(2026.7) - x(2010)" height="92" rx="4" fill="hsl(var(--chart-2) / 0.12)" stroke="hsl(var(--chart-2))" stroke-dasharray="4 3" />
    <text v-for="y in years" :key="y" :x="x(y)" y="118" text-anchor="middle" class="fill-muted-foreground text-[10px]">{{ y }}</text>
  </svg>
</template>
