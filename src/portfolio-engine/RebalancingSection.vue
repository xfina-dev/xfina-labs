<script setup>
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, Segmented,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Input,
} from 'xfina-ui';
import { RotateCcw, ExternalLink, Check } from 'lucide-vue-next';
import { ref, computed, watch, toRefs } from 'vue';
import Field from './Field.vue';
import { ASSETS } from './mockData.js';
import { STRATEGIES as strategies, rebalancing, toggleTicked } from './store.js';

// Two columns, like step 2: the strategies on the left, ticked to include them in a run (Perpetual by default,
// at least one), and on the right the settings of the one clicked. The choices live in the store, so a run and
// its history entries can read them.
const selected = ref('perpetual');
const ticked = (id) => rebalancing.ticked.includes(id);
const current = computed(() => strategies.find((s) => s.id === selected.value));

// Calendar and Threshold trade on the investment day set under Investments. That month's investment is always
// split by the target weights (static, never steered), so whether the rebalance comes before or after it makes
// no difference: on one day at one set of prices both end in the same holdings with the same trades.

// Calendar: the chosen month, or pair of months six apart.
const { frequency, month } = toRefs(rebalancing.calendar);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOptions = computed(() => (frequency.value === 'Annual' ? MONTHS : MONTHS.slice(0, 6).map((m, i) => `${m} and ${MONTHS[i + 6]}`)));
// Keep the month when switching: January stays January, or January and July.
watch(frequency, (f) => { const first = month.value.split(' ')[0]; const i = MONTHS.indexOf(first) % 6; month.value = f === 'Annual' ? first : monthOptions.value[i]; });

// Threshold: drift is checked once a month, on the investment day. A breach by any asset is a complete reset:
// every asset back to its target (the textbook version; Perpetual is the one that trades as little as it can). Each asset has a range it may drift within:
// the band for all assets sets every range, and any range can be edited to its own lower and upper bound.
const { bandType, bandAll } = toRefs(rebalancing.threshold);
const absolute = computed(() => bandType.value.startsWith('Absolute'));
const BANDS = computed(() => (absolute.value ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [5, 10, 15, 20, 25, 30, 40, 50]));
// Absolute is in points of the portfolio and Relative in percent of the target; both read as a plain percent.
const bandLabel = (n) => `±${n}%`;
// A band's numbers mean different things per type, so switching type starts the band for all afresh.
watch(bandType, () => { bandAll.value = absolute.value ? 5 : 20; });
const clamp = (x) => Math.round(Math.max(0, Math.min(100, x)) * 10) / 10;
// The range the band for all assets gives an asset, around its target.
const byBand = (a) => { const t = Number(a.weight) || 0, d = absolute.value ? bandAll.value : (t * bandAll.value) / 100; return { lo: clamp(t - d), hi: clamp(t + d) }; };
const rangeOwn = rebalancing.threshold.rangeOwn; // asset name → { lo, hi } as edited; absent means the band for all assets
const rangeOf = (a) => rangeOwn[a.name] ?? byBand(a);
const edited = (a) => a.name in rangeOwn;
const setBound = (a, key, v) => { if (v === '') return; rangeOwn[a.name] = { ...rangeOf(a), [key]: clamp(Number(v)) }; };
const reset = (a) => { delete rangeOwn[a.name]; };
// A range must hold the target: lower ≤ target ≤ upper, with lower below upper.
const badRange = (a) => { const { lo, hi } = rangeOf(a), t = Number(a.weight) || 0; return !(lo <= t && t <= hi && lo < hi); };

// Perpetual, as in the Perpetual Rebalancing Framework
// (https://sakthipriyan.com/building-wealth/blogs/the-perpetual-rebalancing-framework/). Reviewed monthly, on
// the investment day. Portfolio drift = the sum of the positive drifts (how much is overweight).
// - Buy engine (nothing to set): the month's investment goes to the underweight assets by forward
//   water-filling: the most underweight first, then others as they reach the same drift.
// - Sell engine: when portfolio drift exceeds the maximum (N), the overweight assets are trimmed by reverse
//   water-filling, the most overweight first, with the drift ceiling stepping down to the minimum (N/2) over
//   M monthly reviews. Proceeds go through the same buy step, after tax.
// TODO(engine): lot tracking for 'LTCG lots only' (holding periods per asset class), tax reserved on sale;
// the framework's liquidity reserves (emergency / retirement) are not in this backtest.
const FRAMEWORK = 'https://sakthipriyan.com/building-wealth/blogs/the-perpetual-rebalancing-framework/';
const MAX_DRIFT = [5, 7.5, 10, 12.5, 15, 20];
const { maxDrift, minDrift, sellMonths, ltcgOnly } = toRefs(rebalancing.perpetual);
// Any lower stop is allowed; half the maximum (the framework's N/2) is always offered and is the default.
const minOptions = computed(() => [...new Set([2.5, maxDrift.value / 2, ...MAX_DRIFT.filter((n) => n < maxDrift.value)])].sort((a, b) => a - b));
watch(maxDrift, (n) => { minDrift.value = n / 2; });
const SELL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const pctLabel = (n) => `${n}%`;
const monthsLabel = (n) => `${n} month${n > 1 ? 's' : ''}`;
</script>

<template>
  <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start [&>*]:min-w-0">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Rebalancing</CardTitle>
        <CardDescription>Tick the strategies to run; each one's results are saved and can be compared.</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-3">
          <!-- A checkbox to include the strategy in the run, and the card to open its settings -->
          <div
            v-for="s in strategies" :key="s.id"
            class="flex items-start gap-3 rounded-md border p-4 transition-colors"
            :class="selected === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'"
          >
            <button
              type="button" role="checkbox" :aria-checked="ticked(s.id)" :aria-label="`Include ${s.name} in the run`"
              :title="ticked(s.id) && rebalancing.ticked.length === 1 ? 'At least one strategy is run' : ticked(s.id) ? 'Included in the run' : 'Include in the run'"
              class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors"
              :class="ticked(s.id) ? 'border-status-good bg-status-good text-background' : 'border-muted-foreground/40 hover:border-primary'"
              @click="toggleTicked(s.id)"
            ><Check v-if="ticked(s.id)" class="h-3.5 w-3.5" /></button>
            <button type="button" class="flex-1 text-left" :aria-pressed="selected === s.id" @click="selected = s.id">
              <div class="font-semibold">{{ s.name }}</div>
              <p class="text-sm text-muted-foreground mt-1">{{ s.desc }}</p>
            </button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Settings</CardTitle>
        <CardDescription>
          <!-- Perpetual follows a published framework: its name links to the article, in a new tab -->
          <a v-if="selected === 'perpetual'" :href="FRAMEWORK" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:decoration-2" title="The Perpetual Rebalancing Framework, on sakthipriyan.com">{{ current.name }}<ExternalLink class="h-3.5 w-3.5" /></a>
          <template v-else>{{ current.name }}</template>
        </CardDescription>
      </CardHeader>

      <CardContent v-if="selected === 'hold'">
        <p class="text-sm text-muted-foreground">Nothing to set: the portfolio is never traded back to its targets.</p>
      </CardContent>

      <CardContent v-else-if="selected === 'calendar'" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <Field v-model="frequency" label="How often" :options="['Annual', 'Half-yearly']" />
          <Field v-model="month" label="Month" :options="monthOptions" />
        </div>
        <p class="text-xs text-muted-foreground">
          Every holding goes back to its target weight in {{ month }}, on the investment day set under Investments, whatever its drift.
        </p>
      </CardContent>

      <CardContent v-else-if="selected === 'threshold'" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5"><div class="text-sm font-medium text-muted-foreground">Band type</div><Segmented v-model="bandType" :options="['Absolute', 'Relative']" /></div>
          <Field :model-value="bandLabel(bandAll)" label="Band for all assets" :options="BANDS.map(bandLabel)" @update:model-value="(v) => (bandAll = BANDS.find((n) => bandLabel(n) === v))" />
        </div>

        <!-- Each asset's range: from the band for all, or edited to its own lower and upper bound -->
        <Table class="table-fixed min-w-[22rem] [&_td]:px-2 [&_th]:px-2 [&_th]:h-9">
          <colgroup><col /><col class="w-14" /><col class="w-20" /><col class="w-20" /><col class="w-8" /></colgroup>
          <TableHeader>
            <TableRow><TableHead>Asset</TableHead><TableHead class="text-right">Target</TableHead><TableHead class="text-right">Lower</TableHead><TableHead class="text-right">Upper</TableHead><TableHead><span class="sr-only">Reset</span></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="a in ASSETS" :key="a.name">
              <TableCell class="py-1"><span class="flex items-center gap-2"><i class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: `hsl(var(--${a.color}))` }" />{{ a.name }}</span></TableCell>
              <TableCell class="py-1 text-right tabular-nums">{{ a.weight }}%</TableCell>
              <TableCell v-for="key in ['lo', 'hi']" :key="key" class="py-1">
                <Input
                  :model-value="rangeOf(a)[key]" type="number" min="0" max="100" step="0.5" inputmode="decimal"
                  class="h-7 w-full text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  :class="[badRange(a) ? 'border-status-critical text-status-critical-text' : !edited(a) && 'text-muted-foreground']"
                  :aria-label="`${key === 'lo' ? 'Lower' : 'Upper'} bound for ${a.name}, % of the portfolio`"
                  :title="badRange(a) ? `The range must hold the target, ${a.weight}%` : edited(a) ? 'Edited for this asset' : 'From the band for all assets'"
                  @update:model-value="(v) => setBound(a, key, v)"
                />
              </TableCell>
              <TableCell class="py-1 pl-0">
                <button v-if="edited(a)" type="button" class="grid place-items-center h-7 w-6 rounded text-muted-foreground hover:text-foreground" :aria-label="`Reset ${a.name} to the band for all assets`" title="Back to the band for all assets" @click="reset(a)"><RotateCcw class="h-3.5 w-3.5" /></button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <p class="text-xs text-muted-foreground">Checked monthly, on the investment day: if any asset is outside its range, every asset is reset to its target, including those still inside their ranges.</p>
      </CardContent>

      <!-- Perpetual: a buy engine with nothing to set, and a sell engine with the framework's four settings -->
      <CardContent v-else class="space-y-4">
        <div class="rounded-md border p-3 space-y-1">
          <div class="text-sm font-medium">Buy: forward water-filling</div>
          <p class="text-xs text-muted-foreground">Each month's investment goes to the underweight assets: the most underweight first, then the others as they reach the same drift. Nothing to set.</p>
        </div>
        <div class="space-y-3">
          <div class="text-sm font-medium">Sell: reverse water-filling</div>
          <div class="grid grid-cols-2 gap-4">
            <Field :model-value="pctLabel(maxDrift)" label="Start selling above" :options="MAX_DRIFT.map(pctLabel)" @update:model-value="(v) => (maxDrift = parseFloat(v))" />
            <Field :model-value="pctLabel(minDrift)" label="Stop selling at" :options="minOptions.map(pctLabel)" @update:model-value="(v) => (minDrift = parseFloat(v))" />
            <Field :model-value="monthsLabel(sellMonths)" label="Step down over" :options="SELL_MONTHS.map(monthsLabel)" @update:model-value="(v) => (sellMonths = parseInt(v, 10))" />
            <div class="space-y-1.5"><div class="text-sm font-medium text-muted-foreground">Sell LTCG lots only</div><Segmented v-model="ltcgOnly" :options="['Yes', 'No']" /></div>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          Portfolio drift is how much of the portfolio sits above target, summed across assets. Reviewed monthly, on the investment day: above {{ maxDrift }}%, the most overweight assets are trimmed, with the ceiling stepping down to {{ minDrift }}% over {{ monthsLabel(sellMonths) }}<template v-if="ltcgOnly === 'Yes'">, selling only lots held long enough for long-term capital gains</template>. Sale proceeds are reinvested through the buy step.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
