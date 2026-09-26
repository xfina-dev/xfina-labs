<script setup>
import AppShell from '@/components/AppShell.vue';
import { Button } from '@/components/ui/button';
import Tag from './Tag.vue';
import DataSection from './DataSection.vue';
import PortfolioSection from './PortfolioSection.vue';
import RebalancingSection from './RebalancingSection.vue';
import ResultsSection from './ResultsSection.vue';

// One page, four steps in order. Each step reads what the one above it produced.
const SECTIONS = [
  { id: 'data', label: 'Data', comp: DataSection },
  { id: 'portfolio', label: 'Portfolio', comp: PortfolioSection },
  { id: 'rebalancing', label: 'Rebalancing', comp: RebalancingSection },
  { id: 'results', label: 'Results', comp: ResultsSection },
];
const plan = [
  ['1 · Data: upload + validate', 'ok'], ['2 · Buy & hold, 2+ assets', 'default'], ['3 · Weights + annual rebalance + ledger', 'default'],
  ['4 · Contributions + XIRR', 'default'], ['5 · Threshold + compare', 'default'], ['6 · FX / INR base', 'default'], ['V2 · Perpetual, inflation', 'soon'],
];
</script>

<template>
  <AppShell tool="/backtest/">
    <template #tagline>
      Multi-asset portfolio backtester. Bring your own price data, set weights and a rebalance rule.<br />
      Fast, private, zero-setup, and without uploading your files to any server.
    </template>

    <div class="rounded-md border border-dashed border-[hsl(var(--warn)/0.6)] bg-[hsl(var(--warn)/0.07)] p-3 text-sm space-y-2">
      <div><strong>Design mock.</strong> Every number is illustrative, not a real backtest. Items tagged <Tag variant="soon">later</Tag> are designed for but not in the first increments.</div>
      <div class="flex flex-wrap gap-1.5"><Tag v-for="[t, v] in plan" :key="t" :variant="v" class="normal-case tracking-normal">{{ t }}</Tag></div>
    </div>

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
