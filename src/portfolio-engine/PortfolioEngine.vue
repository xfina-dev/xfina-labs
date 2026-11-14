<script setup>
import { computed, nextTick, onMounted, reactive } from 'vue';
import { Button, FeedbackCard } from 'xfina-ui';
import { ChevronDown, Database, Play } from 'lucide-vue-next';
import AppShell from '@/components/AppShell.vue';
import DataSection from './DataSection.vue';
import PortfolioSection from './PortfolioSection.vue';
import RebalancingSection from './RebalancingSection.vue';
import InvestmentsSection from './InvestmentsSection.vue';
import ResultsSection from './ResultsSection.vue';
import { run, rebalancing, history, selection, investments, labelOf, changed, ui, runState, blocked } from './store.js';
import { ASSETS } from './allocation.js';
import { imported, load as loadImports } from './imports.js';
import { planRows, salarySpan } from './plan.js';

// The four steps fold to a one-line summary each. They start open; Run folds them all, so the results come
// up near the top, and clicking a step's header opens or folds it. Folded steps stay mounted, so nothing in
// them is lost.
const open = reactive({ data: true, portfolio: true, rebalancing: true, investments: true });
const toggle = (id) => { open[id] = !open[id]; };

// Bringing data in, before the steps, as Run comes after them. How to get data opens at the region Select
// Assets shows. The files are read here, in this tab, by the engine's `xfina` half: each one is identified,
// parsed and filed under the asset it belongs to (imports.js). Datasets is where that happens now; this page's
// first step only picks which loaded series each asset uses.
// What this browser holds, read back on load: the table and the run history come up without the engine being
// fetched at all (see imports.js and vault.js). Importing itself happens in Datasets.
onMounted(() => loadImports());

// A run saves one result per ticked strategy, then shows Results.
const runBacktest = async () => {
  await run();
  if (runState.error) return;
  Object.keys(open).forEach((k) => { open[k] = false; });
  nextTick(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }));
};

// What a folded step shows in one line.
const total = computed(() => ASSETS.reduce((n, a) => n + Number(a.weight || 0), 0));
const years = computed(() => (selection.period.from ? ((new Date(selection.period.to) - new Date(selection.period.from)) / (365.25 * 864e5)).toFixed(1) : null));
const SUMMARY = computed(() => ({
  data: selection.series.length
    ? `${selection.series.length} assets · ${selection.period.from} → ${selection.period.to} · ${years.value} years`
    : 'No data imported yet',
  portfolio: ASSETS.map((a) => `${a.name} ${a.weight}%`).join(' · '),
  investments: (() => {
    const rows = planRows(investments), r0 = rows[0], r1 = rows.at(-1), lakh = (x) => `₹${(x / 1e5).toFixed(x >= 1e6 ? 0 : 1)} L`;
    return `${lakh(Number(investments.lumpsum) || 0)} lumpsum · ${lakh(r0.salaryYear)} → ${lakh(salarySpan(investments).end)} a year salary · saving ${Math.round(r0.rate * 100)}% → ${Math.round(r1.rate * 100)}% of take-home · ${investments.startMonth} → ${investments.endMonth}`;
  })(),
  rebalancing: rebalancing.ticked.map((id) => labelOf(id)).join(' | '),
}));
// A folded step with something to fix says so in its summary.
const problem = computed(() => ({ portfolio: total.value !== 100 ? `Allocation totals ${total.value}%, not 100%` : '' }));

// One page: four numbered steps in order, each reading what the ones above produced, then what they come to.
// Results is not a step: its header (with a chart icon, not a number) is part of its pinned bar.
const SECTIONS = [
  { id: 'data', label: 'Series', comp: DataSection },
  { id: 'portfolio', label: 'Set Allocation', comp: PortfolioSection },
  { id: 'rebalancing', label: 'Choose Rebalancing', comp: RebalancingSection },
  { id: 'investments', label: 'Plan Investments', comp: InvestmentsSection },
  { id: 'results', label: 'Runs', comp: ResultsSection, results: true },
];
</script>

<template>
  <AppShell tool="/portfolio-engine/">
    <template #tagline>
      Backtest an asset mix the way you'd actually invest: a lumpsum, then a share of your salary every month, rebalanced by the rules you choose.<br />
      Bring your own data: everything runs in your browser, and nothing is uploaded.
    </template>

    <!-- One row before step 1: where the data comes from. Choosing, downloading, importing and keeping it
         is Datasets' job; this page picks what a run uses and runs it. -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex min-h-11 min-w-0 flex-1 basis-96 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-2 text-sm">
        <span v-if="!imported.loaded">Reading what this browser holds…</span>
        <span v-else-if="imported.storage.files">{{ imported.storage.files }} file{{ imported.storage.files > 1 ? 's' : '' }} kept in this browser. Pick a series for each asset below.</span>
        <span v-else>Nothing imported yet: choose your datasets, download them and import them in Datasets.</span>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-3 ml-auto">
        <a href="/portfolio-engine/datasets/" class="no-underline">
          <Button :variant="imported.storage.files ? 'outline' : 'default'" size="lg"><Database class="h-4 w-4 mr-2" />Datasets</Button>
        </a>
      </div>
    </div>

    <template v-for="(s, i) in SECTIONS" :key="s.id">
      <!-- Run, enabled once a setting differs from the last run; then a rule setting the setup apart from the runs
           it produced -->
      <div v-if="s.id === 'results'" class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <p class="min-w-0 flex-1 text-sm sm:text-right" :class="runState.error ? 'text-status-critical-text' : 'text-muted-foreground'">
          {{ runState.error || blocked || (changed.any ? (history.entries.length ? 'Settings changed since the last run.' : '') : 'Nothing changed since the last run.') }}
        </p>
        <Button
          size="lg" class="min-w-40 px-8 shrink-0" :disabled="!!blocked || runState.busy || (!changed.any && !runState.error)" @click="runBacktest"
          :title="blocked || (runState.busy ? 'Running' : !changed.any ? 'Change a setting above to run again' : rebalancing.ticked.length > 1 ? `Backtest the ${rebalancing.ticked.length} ticked strategies` : 'Backtest the ticked strategy')"
        ><Play class="h-4 w-4 mr-2" />{{ runState.busy ? 'Running…' : 'Run' }}</Button>
      </div>
      <hr v-if="s.id === 'results'" class="border-border" />
      <section :id="s.id" class="space-y-4 scroll-mt-8" :class="!s.results && !open[s.id] && '!space-y-0'">
        <!-- Results carries its own header, pinned with the unit switch and the tabs. A step's header opens or folds it; folded, it shows what the step is set to -->
        <h2 v-if="!s.results">
          <button
            type="button" class="group flex w-full items-center gap-3 text-left" :aria-expanded="open[s.id]" :aria-controls="`${s.id}-body`"
            :title="open[s.id] ? 'Fold this step' : 'Open this step'" @click="toggle(s.id)"
          >
            <span class="inline-grid place-items-center w-6 h-6 shrink-0 rounded-full bg-muted text-xs font-semibold">{{ i + 1 }}</span>
            <span class="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground">{{ s.label }}</span>
            <span v-if="changed[s.id]" class="shrink-0 rounded bg-status-warning/20 px-1.5 py-0.5 text-xs font-medium text-status-warning-text" title="Different from the last run">Changed</span>
            <span v-if="!open[s.id]" class="min-w-0 truncate text-sm" :class="problem[s.id] ? 'font-medium text-status-critical-text' : 'text-foreground'">{{ problem[s.id] || SUMMARY[s.id] }}</span>
            <span class="h-px min-w-6 flex-1 bg-border" />
            <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground" :class="!open[s.id] && '-rotate-90'" />
          </button>
        </h2>
        <div v-show="s.results || open[s.id]" :id="`${s.id}-body`"><component :is="s.comp" /></div>
      </section>
    </template>

    <!-- Once there is a result to react to: how it went, and where to say so (xfina-ui's card, shared with the
         other Xfina sites). Set apart from the results by its rule and one-line nudge, with the same spacing as
         the Xfina family below. -->
    <FeedbackCard
      v-if="history.entries.length" class="pt-8"
      product="Xfina Labs" tool="Portfolio Engine" repo="https://github.com/xfina-dev/xfina-labs"
      storage-key="xfina_labs_feedback_portfolio-engine" nudge="Found this useful? A minute of feedback shapes what we build next."
    />
  </AppShell>
</template>
