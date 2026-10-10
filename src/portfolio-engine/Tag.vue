<script setup>
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps({
  variant: { type: String, default: 'default' }, // default | ok | warn | err | soon
});

// Same pill as Xfina's "Recommended" badge, with status colours added.
const styles = {
  default: 'bg-primary/10 text-primary border-primary/20',
  ok: 'bg-[hsl(var(--ok)/0.12)] text-[hsl(var(--ok))] border-[hsl(var(--ok)/0.4)]',
  warn: 'bg-[hsl(var(--warn)/0.12)] text-[hsl(var(--warn))] border-[hsl(var(--warn)/0.4)]',
  err: 'bg-red-500/10 text-red-500 border-red-500/40',
  soon: 'border-dashed text-muted-foreground',
};
const cls = computed(() =>
  cn('inline-block border px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wide whitespace-nowrap align-middle', styles[props.variant]),
);
</script>

<template><span :class="cls"><slot /></span></template>
