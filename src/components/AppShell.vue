<script setup>
// Page frame shared by every Labs tool: xfina-ui's header, with the tool picker
// beside the title, the page, and the family cards. The header, buttons and
// colours are the same on every xfina.dev site because they all come from
// xfina-ui; Labs adds only its picker and its analytics consent dialog.
import { ref } from 'vue';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
  XfinaFamily, XfinaHeader, XfinaProvider,
} from 'xfina-ui';
import PrivacyDialog from '@/components/PrivacyDialog.vue';

const props = defineProps({
  // Path of the current tool, e.g. "/portfolio-engine/". Empty on the Labs home page.
  tool: { type: String, default: '' },
});

// Add a tool here and it appears in every page's picker.
const TOOLS = [{ path: '/portfolio-engine/', label: 'Portfolio Engine' }];
const HOME = '/';

// Each tool is its own page, so picking one loads it.
const selected = ref(props.tool || HOME);
const go = (path) => {
  if (path !== (props.tool || HOME)) window.location.href = path;
};

const privacyOpen = ref(false);
</script>

<template>
  <XfinaProvider>
    <div class="xf-container space-y-8">
      <XfinaHeader site="labs" home="/" :heading="!tool" own-privacy @privacy="privacyOpen = true">
        <template #context>
          <Select :model-value="selected" @update:model-value="go">
            <SelectTrigger class="h-9 w-auto min-w-[140px] gap-2 shadow-sm" aria-label="Tool">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem :value="HOME">All tools</SelectItem>
                <SelectItem v-for="t in TOOLS" :key="t.path" :value="t.path">{{ t.label }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </template>
        <template v-if="$slots.tagline" #tagline><slot name="tagline" /></template>
      </XfinaHeader>
      <!-- A tool's page is a run of sections (Import data, Portfolio, ...) with
           no wrapper of its own, so the shell spaces them, as it always has. -->
      <main class="space-y-8">
        <slot />
      </main>
      <XfinaFamily site="labs" class="pt-8" />
    </div>
    <PrivacyDialog v-model:open="privacyOpen" />
  </XfinaProvider>
</template>
