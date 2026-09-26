<script setup>
import { ref } from 'vue';
import { Calendar } from 'lucide-vue-next';
import { fmtDate } from './format.js';

// A date field that always shows "Apr 1, 2026". A native date input shows whatever format the browser's
// locale wants, so the visible field is a button and the browser's own calendar picker is a hidden native
// input that the button opens. The value is an ISO date, "2026-04-01".
defineProps({ modelValue: { type: String, default: '' }, min: String, max: String });
defineEmits(['update:modelValue']);

const native = ref(null);
const open = () => {
  try { native.value.showPicker(); } catch { native.value.focus(); native.value.click(); }
};
</script>

<template>
  <span class="relative inline-flex">
    <button type="button" class="h-8 w-40 inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm text-foreground hover:bg-accent" @click="open">
      <span :class="!modelValue && 'text-muted-foreground'">{{ fmtDate(modelValue) || 'Pick a date' }}</span>
      <Calendar class="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
    <input
      ref="native" type="date" :value="modelValue" :min="min" :max="max" tabindex="-1" aria-hidden="true"
      class="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  </span>
</template>
