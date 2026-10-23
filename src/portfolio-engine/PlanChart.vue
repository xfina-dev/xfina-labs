<script setup>
import { computed, ref } from 'vue';

// The plan in one chart, one point per contribution year: each year's monthly salary stacked into savings
// (invested, gold, bottom), expenses (what's left to spend, blue) and income tax (red, top), so the top edge is
// the salary and the bottom band the monthly investment. Where they end is labelled. Pointing at the chart (or
// focusing it and using the arrow keys) marks a year with a guide line and shows that year's figures in full.
const props = defineProps({
  rows: { type: Array, required: true }, // planRows(): [{ from: 'YYYY-MM', salaryYear, salary, tax, monthly, spent, rate }]
  format: { type: Function, required: true }, // short money, e.g. ₹3.06 L
});

const W = 480, H = 300, T = 22, B = 18;
const LAYERS = [
  { key: 'monthly', label: 'Savings', color: 'chart-4' },
  { key: 'spent', label: 'Expenses', color: 'chart-1' },
  { key: 'tax', label: 'Income tax', color: 'chart-8' },
];
const fill = (l, strong) => `hsl(var(--${l.color}) / ${strong ? 0.9 : 0.7})`;
const n = computed(() => props.rows.length);
const hi = computed(() => Math.max(...props.rows.map((r) => r.salary)) * 1.04 || 1);
const sx = (i) => (n.value > 1 ? i / (n.value - 1) : 0.5) * W;
const sy = (v) => T + (1 - v / hi.value) * (H - T - B);
// Each layer from its bottom (the layers below it) to its top, as one closed path.
const below = (r, k) => LAYERS.slice(0, k).reduce((s, l) => s + r[l.key], 0);
const bands = computed(() => LAYERS.map((layer, k) => {
  const top = props.rows.map((r, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(below(r, k) + r[layer.key]).toFixed(1)}`).join('');
  const bottom = props.rows.map((_, j) => { const i = n.value - 1 - j; return `L${sx(i).toFixed(1)} ${sy(below(props.rows[i], k)).toFixed(1)}`; }).join('');
  return { ...layer, d: `${top}${bottom}Z` };
}));
const salaryLine = computed(() => props.rows.map((r, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(r.salary).toFixed(1)}`).join(''));
const last = computed(() => props.rows.at(-1));
const years = computed(() => {
  const k = n.value - 1;
  return [...new Set([0, Math.round(k / 3), Math.round((2 * k) / 3), k])].map((i) => ({ i, y: props.rows[i].from.slice(0, 4) }));
});

// The year pointed at: the nearest point to the pointer, or stepped with the arrow keys.
const at = ref(null);
const svg = ref(null);
const point = (e) => {
  const r = svg.value.getBoundingClientRect();
  at.value = Math.max(0, Math.min(n.value - 1, Math.round(((e.clientX - r.left) / r.width) * (n.value - 1))));
};
const step = (d) => { at.value = Math.max(0, Math.min(n.value - 1, (at.value ?? (d > 0 ? -1 : n.value)) + d)); };
const row = computed(() => (at.value === null ? null : props.rows[at.value]));
const rupees = (x) => `₹${Math.round(x).toLocaleString('en-IN')}`;
const pct = (x) => `${(x * 100).toFixed(x * 100 % 1 ? 1 : 0)}%`;
// The panel sits beside the guide line, on whichever side has room.
const panelLeft = computed(() => (at.value === null ? 0 : (sx(at.value) / W) * 100));
</script>

<template>
  <div>
    <div class="relative">
      <svg
        ref="svg" :viewBox="`0 0 ${W} ${H}`" class="w-full cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-ring" role="img" tabindex="0"
        aria-label="Monthly salary by year: savings, expenses and income tax. Use the arrow keys to read each year."
        @mousemove="point" @mouseleave="at = null" @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)" @blur="at = null"
      >
        <line :x1="0" :x2="W" :y1="sy(0)" :y2="sy(0)" class="stroke-border" />
        <path v-for="b in bands" :key="b.key" :d="b.d" :fill="fill(b)" />
        <path :d="salaryLine" fill="none" class="stroke-foreground" stroke-width="1.5" />
        <!-- Where the salary and the savings end: the salary above its line, the savings inside its band -->
        <text :x="W" :y="sy(last.salary) - 7" text-anchor="end" class="fill-foreground text-[12px] font-semibold tabular-nums">{{ format(last.salary) }} salary</text>
        <text :x="W - 5" :y="sy(last.monthly) + 15" text-anchor="end" class="fill-foreground text-[12px] font-semibold tabular-nums">{{ format(last.monthly) }} saved</text>
        <text v-for="(t, k) in years" :key="t.i" :x="sx(t.i)" :y="H - 3" :text-anchor="k === 0 ? 'start' : k === years.length - 1 ? 'end' : 'middle'" class="fill-muted-foreground text-[11px]">{{ t.y }}</text>
        <!-- The year pointed at: a guide line and a dot on each layer's top -->
        <g v-if="row">
          <line :x1="sx(at)" :x2="sx(at)" :y1="T - 6" :y2="sy(0)" class="stroke-foreground" stroke-dasharray="3 3" />
          <circle v-for="(l, k) in LAYERS" :key="l.key" :cx="sx(at)" :cy="sy(below(row, k) + row[l.key])" r="4" :fill="fill(l, true)" class="stroke-background" stroke-width="1.5" />
        </g>
      </svg>
      <!-- That year in full -->
      <div
        v-if="row" class="pointer-events-none absolute top-2 z-10 w-60 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        :style="panelLeft > 50 ? { right: `${100 - panelLeft + 2}%` } : { left: `${panelLeft + 2}%` }"
      >
        <div class="mb-1.5 font-semibold">{{ row.from.slice(0, 4) }}</div>
        <dl class="space-y-0.5 tabular-nums">
          <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Salary, a year</dt><dd>{{ rupees(row.salaryYear) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Salary, a month</dt><dd class="font-medium">{{ rupees(row.salary) }}</dd></div>
          <div class="flex justify-between gap-3"><dt><i class="mr-1.5 inline-block h-2 w-2 rounded-sm" :style="{ background: fill(LAYERS[2], true) }" />Income tax</dt><dd>{{ rupees(row.tax) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Take-home</dt><dd>{{ rupees(row.salary - row.tax) }}</dd></div>
          <div class="flex justify-between gap-3"><dt><i class="mr-1.5 inline-block h-2 w-2 rounded-sm" :style="{ background: fill(LAYERS[1], true) }" />Expenses</dt><dd>{{ rupees(row.spent) }}</dd></div>
          <div class="flex justify-between gap-3"><dt><i class="mr-1.5 inline-block h-2 w-2 rounded-sm" :style="{ background: fill(LAYERS[0], true) }" />Savings, invested</dt><dd class="font-medium">{{ rupees(row.monthly) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Savings rate, of take-home</dt><dd>{{ pct(row.rate) }}</dd></div>
        </dl>
      </div>
    </div>
    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span><i class="mr-1.5 inline-block h-0.5 w-3 align-middle bg-foreground" />Monthly salary, before tax</span>
      <span v-for="b in bands" :key="b.key"><i class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" :style="{ background: fill(b) }" />{{ b.label }}</span>
    </div>
  </div>
</template>
