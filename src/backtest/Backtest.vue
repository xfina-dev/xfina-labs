<script setup>
import { ref, onMounted } from 'vue';
import AppShell from '@/components/AppShell.vue';
import Tag from './Tag.vue';
import DataTab from './DataTab.vue';
import PortfolioTab from './PortfolioTab.vue';
import StrategyTab from './StrategyTab.vue';
import TaxTab from './TaxTab.vue';
import ResultsTab from './ResultsTab.vue';

const TABS = [
  { id: 'data', label: 'Data', comp: DataTab },
  { id: 'portfolio', label: 'Portfolio', comp: PortfolioTab },
  { id: 'strategy', label: 'Strategy', comp: StrategyTab },
  { id: 'tax', label: 'Tax', comp: TaxTab, soon: true },
  { id: 'results', label: 'Results', comp: ResultsTab },
];
const plan = [
  ['1 · Data: upload + validate', 'ok'], ['2 · Buy & hold, 2+ assets', 'default'], ['3 · Weights + annual rebalance + ledger', 'default'],
  ['4 · Contributions + XIRR', 'default'], ['5 · Threshold + compare', 'default'], ['6 · FX / INR base', 'default'], ['V2 · Perpetual, tax, inflation', 'soon'],
];

const active = ref('data');
const fromHash = () => {
  const h = location.hash.slice(1);
  if (TABS.some((t) => t.id === h)) active.value = h;
};
const select = (id) => {
  active.value = id;
  history.replaceState(null, '', `#${id}`);
};
onMounted(() => {
  fromHash();
  window.addEventListener('hashchange', fromHash);
});
</script>

<template>
  <AppShell tool="/backtest/">
    <template #tagline>
      Multi-asset portfolio backtester. Bring your own price data, set weights and a rebalance rule.<br />
      Fast, private, zero-setup, and without uploading your files to any server.
    </template>

    <div class="rounded-md border border-dashed border-[hsl(var(--warn)/0.6)] bg-[hsl(var(--warn)/0.07)] p-3 text-sm space-y-2">
      <div><strong>Design mock.</strong> Screens are static and every number is illustrative, not a real backtest. Items tagged <Tag variant="soon">later</Tag> are designed for but not in the first increments.</div>
      <div class="flex flex-wrap gap-1.5"><Tag v-for="[t, v] in plan" :key="t" :variant="v" class="normal-case tracking-normal">{{ t }}</Tag></div>
    </div>

    <nav class="flex gap-1 border-b overflow-x-auto overflow-y-hidden" role="tablist">
      <button
        v-for="(t, i) in TABS" :key="t.id" role="tab" :aria-selected="active === t.id"
        class="h-10 px-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors"
        :class="active === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="select(t.id)"
      >
        <span class="inline-grid place-items-center w-[18px] h-[18px] rounded-full bg-muted text-[11px] mr-1.5">{{ i + 1 }}</span>{{ t.label }}
        <Tag v-if="t.soon" variant="soon" class="ml-1.5">later</Tag>
      </button>
    </nav>

    <component :is="TABS.find((t) => t.id === active).comp" />
  </AppShell>
</template>
