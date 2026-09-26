<script setup>
import AppShell from '@/components/AppShell.vue';
import { Button } from '@/components/ui/button';
import DataSection from './DataSection.vue';
import PortfolioSection from './PortfolioSection.vue';
import RebalancingSection from './RebalancingSection.vue';
import ResultsSection from './ResultsSection.vue';

// One page, four steps in order. Each step reads what the one above it produced.
const SECTIONS = [
  { id: 'data', label: 'Import Data', comp: DataSection },
  { id: 'portfolio', label: 'Setup Portfolio', comp: PortfolioSection },
  { id: 'rebalancing', label: 'Choose Rebalancing', comp: RebalancingSection },
  { id: 'results', label: 'Results', comp: ResultsSection },
];
</script>

<template>
  <AppShell tool="/portfolio-engine/">
    <template #tagline>
      Multi-asset portfolio engine with bring-your-own data.<br />
      Everything runs in your browser; nothing is uploaded to any server.
    </template>

    <template v-for="(s, i) in SECTIONS" :key="s.id">
      <div v-if="s.id === 'results'" class="flex justify-end">
        <Button size="lg">Run backtest</Button>
      </div>
      <section :id="s.id" class="space-y-4 scroll-mt-8">
        <div class="flex items-center gap-3">
          <span class="inline-grid place-items-center w-6 h-6 rounded-full bg-muted text-xs font-semibold">{{ i + 1 }}</span>
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{{ s.label }}</h2>
          <div class="h-px flex-1 bg-border" />
        </div>
        <component :is="s.comp" />
      </section>
    </template>
  </AppShell>
</template>
