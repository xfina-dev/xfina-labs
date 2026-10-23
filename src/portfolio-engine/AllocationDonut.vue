<script setup>
import { computed } from 'vue';

// The allocation as a donut: one slice per asset in its colour, in the table's order from twelve o'clock.
// The middle shows the total (the table's check: it must be 100%) and the number of assets; pointing at a slice
// (or its table row, or focusing it) raises that slice, dims the rest, and shows its weight, name, type and series
// in the middle instead. Short of 100%, the gap shows as an unallocated slice; over it, the slices share the
// ring and the total turns red.
const props = defineProps({
  assets: { type: Array, required: true }, // [{ name, weight, color, type?, series? }]
});
const active = defineModel('active', { type: String, default: null }); // the asset name pointed at

// A wide hole for the text in the middle: the ring stays inside the 200-unit box even when a slice is raised.
const R = 82, STROKE = 22, C = 2 * Math.PI * R;
const total = computed(() => props.assets.reduce((n, a) => n + (Number(a.weight) || 0), 0));
const slices = computed(() => {
  const whole = Math.max(100, total.value);
  let at = 0;
  const out = props.assets.filter((a) => Number(a.weight) > 0).map((a) => {
    const len = (Number(a.weight) / whole) * C;
    const s = { ...a, weight: Number(a.weight), stroke: `hsl(var(--${a.color}))`, dash: `${len} ${C - len}`, offset: -at };
    at += len;
    return s;
  });
  if (total.value < 100) out.push({ name: 'Unallocated', weight: 100 - total.value, stroke: 'hsl(var(--muted-foreground) / 0.2)', dash: `${C - at} ${at}`, offset: -at, gap: true });
  return out;
});
const shown = computed(() => slices.value.find((s) => s.name === active.value) ?? null);
</script>

<template>
  <svg viewBox="0 0 200 200" class="mx-auto w-full max-w-[18rem]" role="img" :aria-label="`Allocation: ${assets.map((a) => `${a.name} ${a.weight}%`).join(', ')}`" @mouseleave="active = null">
    <!-- Starts at twelve o'clock and runs clockwise -->
    <g transform="rotate(-90 100 100)">
      <circle cx="100" cy="100" :r="R" fill="none" class="stroke-muted" :stroke-width="STROKE" />
      <circle
        v-for="s in slices" :key="s.name" cx="100" cy="100" :r="R" fill="none" :stroke="s.stroke"
        :stroke-width="shown === s ? STROKE + 8 : STROKE" :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset"
        :opacity="shown && shown !== s ? 0.35 : 1" class="cursor-pointer outline-none transition-[stroke-width,opacity] duration-150"
        tabindex="0" :aria-label="`${s.name}: ${s.weight}%`"
        @mouseenter="active = s.name" @focus="active = s.name" @blur="active = null"
      />
    </g>
    <!-- The middle: the pointed-at asset, or the total -->
    <foreignObject x="34" y="44" width="132" height="112">
      <div class="flex h-full flex-col items-center justify-center text-center leading-tight">
        <template v-if="shown">
          <div class="text-[26px] font-semibold tabular-nums">{{ shown.weight }}%</div>
          <div class="line-clamp-2 text-[12px] font-medium">{{ shown.name }}</div>
          <div v-if="!shown.gap && (shown.type || shown.series)" class="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{{ [shown.type, shown.series].filter(Boolean).join(' · ') }}</div>
        </template>
        <template v-else>
          <div class="text-[30px] font-semibold tabular-nums" :class="total === 100 ? 'text-foreground' : 'text-status-critical-text'">{{ total }}%</div>
          <div class="text-[12px] text-muted-foreground">{{ assets.length }} asset{{ assets.length === 1 ? '' : 's' }}</div>
        </template>
      </div>
    </foreignObject>
  </svg>
</template>
