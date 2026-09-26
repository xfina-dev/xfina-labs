<script setup>
// Page frame shared by every Labs tool. Layout, spacing and header follow
// xfina/web/src/App.vue exactly so all xfina.dev subdomains look the same.
import AppHeader from '@/components/AppHeader.vue';

defineProps({
  tool: { type: String, default: '' },
});
</script>

<template>
  <div class="min-h-screen bg-background text-foreground p-8 font-sans transition-colors duration-200">
    <div class="max-w-6xl mx-auto space-y-8">
      <AppHeader :tool="tool">
        <slot name="tagline" />
      </AppHeader>
      <slot />
    </div>
  </div>
</template>
