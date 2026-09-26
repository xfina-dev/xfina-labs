<script setup>
import { ref, onMounted } from 'vue';
import { useDark } from '@vueuse/core';
import { Sun, Moon, Github, Activity } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PrivacyDialog from '@/components/PrivacyDialog.vue';

const props = defineProps({
  // Path of the current tool, e.g. "/backtest/". Empty on the Labs home page.
  tool: { type: String, default: '' },
});

// Add a tool here and it appears in every page's switcher.
const TOOLS = [{ path: '/backtest/', label: 'Portfolio Engine' }];
const HOME = '/';

const selected = ref(props.tool || HOME);
const go = (path) => {
  window.location.href = path;
};

const isDark = useDark();
const toggleDark = () => {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle('dark', isDark.value);
};
onMounted(() => document.documentElement.classList.toggle('dark', isDark.value));
</script>

<template>
  <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
    <div class="flex items-start gap-5">
      <a href="/" class="hover:opacity-80 transition-opacity flex-shrink-0 cursor-pointer">
        <img src="/favicon.svg" alt="Xfina Logo" class="w-16 h-16" />
      </a>
      <div class="space-y-2">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <a href="/" class="hover:text-primary transition-colors cursor-pointer">
            <h1 class="text-3xl font-bold tracking-tight">Xfina Labs</h1>
          </a>
          <div class="flex items-center">
            <Select :modelValue="selected" @update:modelValue="go">
              <SelectTrigger class="w-[170px] h-9 border-border bg-background shadow-sm focus:z-10 focus:ring-1">
                <SelectValue placeholder="Tool" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem :value="HOME">All tools</SelectItem>
                  <SelectItem v-for="t in TOOLS" :key="t.path" :value="t.path">{{ t.label }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p class="text-muted-foreground mt-2 leading-relaxed">
          <slot>
            Experimental finance tools for long-term investors.<br />
            Everything runs in your browser; nothing is uploaded to any server.
          </slot>
        </p>
      </div>
    </div>
    <div class="flex items-center space-x-3">
      <a href="https://sakthipriyan.com/building-wealth" target="_blank" rel="noopener noreferrer" class="no-underline">
        <Button variant="outline" class="h-9 px-3 font-medium text-foreground">sakthipriyan.com</Button>
      </a>
      <a href="https://github.com/xfina-dev/xfina-labs" target="_blank" rel="noopener noreferrer" class="no-underline" title="GitHub Repository">
        <Button variant="outline" size="icon">
          <Github class="h-[1.2rem] w-[1.2rem] text-foreground" />
          <span class="sr-only">GitHub Repository</span>
        </Button>
      </a>
      <PrivacyDialog>
        <Button variant="outline" size="icon" title="Privacy & Analytics">
          <Activity class="h-[1.2rem] w-[1.2rem] text-foreground" />
          <span class="sr-only">Privacy & Analytics</span>
        </Button>
      </PrivacyDialog>
      <Button variant="outline" size="icon" @click="toggleDark()" title="Toggle Theme">
        <Sun v-if="isDark" class="h-[1.2rem] w-[1.2rem] text-foreground" />
        <Moon v-else class="h-[1.2rem] w-[1.2rem] text-foreground" />
        <span class="sr-only">Toggle theme</span>
      </Button>
    </div>
  </div>
</template>
