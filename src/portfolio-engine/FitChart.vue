<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

// Fills the room a card's box leaves after the legend, and hands the chart inside the viewBox height that
// matches that room at the chart's 640-unit width. The chart then draws edge to edge, with no letterboxing,
// and its text keeps its size.
const props = defineProps({
  width: { type: Number, default: 640 }, // the chart's viewBox width
  min: { type: Number, default: 140 }, // never flatter than this
});

const el = ref(null);
const h = ref(220);
const fit = (width, height) => { if (width && height) h.value = Math.max(props.min, Math.round((props.width * height) / width)); };
let observer;
onMounted(() => {
  const r = el.value.getBoundingClientRect();
  fit(r.width, r.height);
  observer = new ResizeObserver(([e]) => fit(e.contentRect.width, e.contentRect.height));
  observer.observe(el.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="el" class="min-h-0 flex-1"><slot :h="h" /></div>
</template>
