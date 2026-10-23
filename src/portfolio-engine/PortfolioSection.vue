<script setup>
import {
  Input, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow, Badge,
  ColorPicker,
} from 'xfina-ui';
import { tone } from './tone.js';
import { ref, computed, nextTick } from 'vue';
import { Check, GripVertical } from 'lucide-vue-next';
import { ASSETS } from './mockData.js';
import AllocationDonut from './AllocationDonut.vue';
import { selection } from './store.js';

const total = computed(() => ASSETS.reduce((n, a) => n + Number(a.weight || 0), 0));
// Weights are whole percentages, 0 to 100, stepped by 1: a decimal point, sign or exponent cannot be typed,
// and anything pasted is rounded and clamped.
const setWeight = (a, v) => { a.weight = v === '' ? '' : Math.min(100, Math.max(0, Math.round(Number(v) || 0))); };
const wholeOnly = (e) => { if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); };
// Each asset's colour, from xfina-ui's chart colours. Defaults follow the slot order (chart-1, chart-2, …), the
// order the palette was validated in; the picker is for overriding one. It marks the colours other assets use:
// { token: 'Asset, Asset' }, leaving out the asset's own.
const usedBy = (self) => {
  const m = {};
  for (const a of ASSETS) if (a !== self) m[a.color] = m[a.color] ? `${m[a.color]}, ${a.name}` : a.name;
  return m;
};

// Rows reorder by dragging the handle, or with the arrow keys while it has focus. The order is the order
// the results list the assets in.
const handles = ref([]);
const dragFrom = ref(null);
const dropAt = ref(null);
function move(from, to) {
  if (to < 0 || to >= ASSETS.length || from === to) return;
  ASSETS.splice(to, 0, ...ASSETS.splice(from, 1));
}
function onKey(e, i) {
  const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
  if (to === null) return;
  e.preventDefault();
  move(i, to);
  nextTick(() => handles.value[Math.max(0, Math.min(ASSETS.length - 1, to))]?.focus());
}
const onDrop = () => { if (dragFrom.value !== null && dropAt.value !== null) move(dragFrom.value, dropAt.value); dragFrom.value = dropAt.value = null; };

// The donut and the table point at the same asset: hovering a row raises its slice, and a slice its row. The
// donut also shows each asset's series, from Select Assets.
const active = ref(null);
const donutAssets = computed(() => ASSETS.map((a) => ({ ...a, series: selection.series.find((x) => `${x.tab}|${x.asset}` === a.key)?.series })));
</script>

<template>
  <!-- Two columns, as in Choose Rebalancing: the table, and the mix it makes -->
  <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start [&>*]:min-w-0">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Allocation</CardTitle>
        <CardDescription>Target weights must total 100%.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Fixed widths, so the total's badge never widens a column and moves the numbers. Asset takes the rest;
             narrower than the minimum, the table scrolls inside the card. -->
        <Table class="table-fixed min-w-[36rem]">
          <colgroup><col class="w-9" /><col /><col class="w-24" /><col class="w-36" /><col class="w-28" /></colgroup>
          <TableHeader>
            <TableRow><TableHead class="pr-0"><span class="sr-only">Order</span></TableHead><TableHead>Asset</TableHead><TableHead>Type</TableHead><TableHead>Weight</TableHead><TableHead class="text-right">%</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="(a, i) in ASSETS" :key="a.name" :draggable="dragFrom === i"
              @mouseenter="active = a.name" @mouseleave="active = null"
              :class="[active === a.name && 'bg-muted/50', dragFrom === i && 'opacity-50', dropAt === i && dragFrom !== i && (dropAt < dragFrom ? 'shadow-[inset_0_2px_0_hsl(var(--primary))]' : 'shadow-[inset_0_-2px_0_hsl(var(--primary))]')]"
              @dragstart="(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.name); }"
              @dragover.prevent="dragFrom !== null && (dropAt = i)" @drop.prevent="onDrop" @dragend="dragFrom = dropAt = null"
            >
              <TableCell class="pr-0">
                <button
                  :ref="(el) => (handles[i] = el)" type="button" class="grid place-items-center h-7 w-5 rounded cursor-grab text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  :aria-label="`Move ${a.name}: drag, or use the up and down arrow keys`" :title="`Drag to reorder, or focus and use ↑ ↓`"
                  @pointerdown="dragFrom = i" @pointerup="dragFrom === i && dropAt === null && (dragFrom = null)" @keydown="(e) => onKey(e, i)"
                ><GripVertical class="h-4 w-4" /></button>
              </TableCell>
              <TableCell class="font-medium">
                <div class="flex items-center gap-2">
                  <ColorPicker v-model="a.color" :label="`Colour for ${a.name}`" :used="usedBy(a)" />
                  <span>{{ a.name }}</span>
                </div>
              </TableCell>
              <TableCell class="whitespace-nowrap"><Badge :variant="tone(a.type === 'ETF' || a.type === 'MF' ? 'warn' : 'default')">{{ a.type }}</Badge></TableCell>
              <TableCell><div class="h-2 rounded-full bg-muted overflow-hidden"><div class="h-full" :style="{ width: `${a.weight * 2}%`, background: `hsl(var(--${a.color}))` }" /></div></TableCell>
              <TableCell class="text-right"><Input :model-value="a.weight" type="number" min="0" max="100" step="1" inputmode="numeric" class="h-8 w-20 ml-auto text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" @update:model-value="(v) => setWeight(a, v)" @keydown="wholeOnly" /></TableCell>
            </TableRow>
          </TableBody>
          <TableFooter class="bg-transparent">
            <!-- The same marks as a series in the Assets table: a green tick when the weights total 100%, a red
                 circle when not. The mark sits before Total, so it never moves the number. -->
            <TableRow class="hover:bg-transparent" :title="total === 100 ? 'Weights total 100%' : 'Weights must total 100%'">
              <TableCell colspan="3" class="font-semibold">
                <!-- A block-level row, so the mark (empty when red) never shifts the text baseline, and as tall as the
                     badge, so the row keeps its height whether the badge shows or not -->
                <span class="flex min-h-[26px] items-center gap-2" :class="total === 100 ? 'text-status-good-text' : 'text-status-critical-text'">
                  <span v-if="total === 100" class="grid place-items-center h-5 w-5 rounded-full border border-status-good bg-status-good text-background"><Check class="h-3.5 w-3.5" /></span>
                  <span v-else class="h-5 w-5 rounded-full border border-status-critical bg-status-critical/15" />
                  Total
                </span>
              </TableCell>
              <!-- Says which way and by how much, so the fix is obvious. It sits in the Weight column, just before the
                   number, so the % column never changes width. -->
              <TableCell class="text-right">
                <Badge v-if="total !== 100" :variant="tone('err')">{{ total < 100 ? `Short by ${100 - total}%` : `Over by ${total - 100}%` }}</Badge>
              </TableCell>
              <TableCell class="text-right font-semibold">
                <!-- The input's padding and border, unseen, so this total's digits end where the weights' do -->
                <span class="tabular-nums border border-transparent px-3" :class="total === 100 ? 'text-status-good-text' : 'text-status-critical-text'">{{ total }}</span>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>

    <!-- The same weights and colours as a donut; the table is its legend -->
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Mix</CardTitle>
        <CardDescription>Each asset's share of the portfolio.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <AllocationDonut v-model:active="active" :assets="donutAssets" />
        <p class="text-xs text-muted-foreground">Type is that of the series picked for the asset under Select Assets. <Badge>Index</Badge> is the benchmark itself; <Badge variant="warning">ETF</Badge> and <Badge variant="warning">MF</Badge> are funds you could have held. They are not the same: results differ by fees and tracking.</p>
      </CardContent>
    </Card>

  </div>
</template>
