<script setup>
// Segmented control: a row of outline buttons where one is active.
defineProps({ options: { type: Array, required: true }, modelValue: { type: String, required: true }, disabled: Array });
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="inline-flex rounded-md border border-border overflow-hidden">
    <button
      v-for="o in options" :key="o" type="button"
      class="px-3 h-9 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      :class="o === modelValue ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'"
      :disabled="disabled?.includes(o)"
      @click="$emit('update:modelValue', o)"
    >{{ o }}</button>
  </div>
</template>
