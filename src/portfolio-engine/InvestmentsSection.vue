<script setup>
import { computed } from 'vue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from 'xfina-ui';
import Field from './Field.vue';
import MoneyInput from './MoneyInput.vue';
import PlanChart from './PlanChart.vue';
import { investments as plan, selection } from './store.js';
import { CURVES, planRows, salarySpan, planYears, monthsBetween } from './plan.js';

// Step 4: how the money goes in. A lumpsum, then each month a share of take-home pay: the yearly salary (before
// tax) moves from a starting amount to an ending one (or grows by a yearly rate), income tax takes a share of it
// (a flat rate for now), and the savings rate moves from a starting share of what's left to an ending one, each
// along its own curve. One chart draws it as it is set: each year's monthly salary split into invested, spent
// and tax.

// Amounts and rates are numbers; an input gives text.
const num = (key) => computed({ get: () => plan[key], set: (v) => { plan[key] = v === '' ? '' : Number(v); } });
const lumpsum = num('lumpsum'), salaryStart = num('salaryStart'), salaryEnd = num('salaryEnd');
// A growth carried over from an ending salary is exact; it shows to two decimals.
const salaryGrowth = computed({ get: () => (plan.salaryGrowth === '' ? '' : Math.round(plan.salaryGrowth * 100) / 100), set: (v) => { plan.salaryGrowth = v === '' ? '' : Number(v); } });
const rateStart = num('rateStart'), rateEnd = num('rateEnd');

// The run's months bound the contributions (Select Assets sets the run).
const runFirst = computed(() => selection.period.from.slice(0, 7));
const runLast = computed(() => selection.period.to.slice(0, 7));
const ordinal = (d) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
// Investment day: the first or last working day of the month, or a day of the month (1st to 31st).
// TODO(engine): if the chosen day is a holiday for transactions, the investment happens on the next working
// day, at the price of the previous close. A day the month does not have (the 31st in a 30-day month,
// the 29th to 31st in February) still needs a rule; the likely one is the month's last day.
const DAY_GROUPS = [
  { label: 'Working day', options: ['First working day', 'Last working day'] },
  { label: 'Day of month', options: Array.from({ length: 31 }, (_, i) => ordinal(i + 1)) },
];

const rows = computed(() => planRows(plan));
const span = computed(() => salarySpan(plan));
const years = computed(() => planYears(plan));
const yearOf = (r) => r.from.slice(0, 4);
const rupees = (x) => `₹${Math.round(x).toLocaleString('en-IN')}`;
const trim = (x) => x.toFixed(2).replace(/\.?0+$/, '');
const short = (x) => (x >= 1e7 ? `₹${trim(x / 1e7)} Cr` : x >= 1e5 ? `₹${trim(x / 1e5)} L` : `₹${Math.round(x / 1e3)}K`);
const pctOf = (x) => `${(x * 100).toFixed(x * 100 % 1 ? 1 : 0)}%`;
// Everything the monthly investments add up to: each year's amount for its months (the last year may be short).
const months = computed(() => monthsBetween(plan.startMonth, plan.endMonth));
const total = computed(() => rows.value.reduce((n, r, y) => n + r.monthly * Math.min(12, months.value - y * 12), 0));
// Switching between the ending salary and the yearly growth carries the plan over: the one switched to takes
// the value the other implies (10% a year → the ₹91,73,864 it ends at; that ending → 10%), kept exact so the
// curve holds and a round trip returns what was typed (80 L → 9.21% → 80 L). Only the display is rounded.
function setSalaryBy(by) {
  if (by === plan.salaryBy) return;
  const { end, growth } = salarySpan(plan);
  if (by === 'Ending') plan.salaryEnd = end;
  else plan.salaryGrowth = growth * 100;
  plan.salaryBy = by;
}
const SALARY_BY = [{ value: 'Ending', label: 'Ending' }, { value: 'Growth', label: 'Growth (%)' }];
</script>

<template>
  <!-- Two columns, as in the other steps: the inputs in the wider first, the plan's chart in the second -->
  <div class="grid gap-8 lg:grid-cols-[1.35fr_1fr] items-start [&>*]:min-w-0">
    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Investments</CardTitle>
        <CardDescription>A lumpsum, then each month a share of what you take home.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <!-- When: the lumpsum, the day each month and the months it runs -->
        <div class="grid grid-cols-2 gap-4">
          <MoneyInput v-model="lumpsum" label="Lumpsum" />
          <Field v-model="plan.investDay" label="Investment day" :groups="DAY_GROUPS" />
          <Field v-model="plan.startMonth" label="Contribution start" type="month" :min="runFirst" :max="plan.endMonth" />
          <Field v-model="plan.endMonth" label="Contribution end" type="month" :min="plan.startMonth" :max="runLast" />
        </div>

        <!-- Salary, a year before tax: start, then its end or its yearly growth (the other follows), and the curve,
             on one row -->
        <section class="space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salary, a year before tax</h4>
          <div class="grid grid-cols-[1.3fr_1.3fr_1fr] gap-4">
            <MoneyInput v-model="salaryStart" label="Starting" aria="Starting salary, a year before tax" />
            <div class="space-y-1.5">
              <!-- The label is the choice: the ending salary, or a yearly growth; the other follows from it. Laid out
                   as a text line, like Field's label, so the inputs line up -->
              <div><span class="text-sm font-medium leading-none" role="group" aria-label="Set the salary's end by">
                <template v-for="(o, k) in SALARY_BY" :key="o.value">
                  <span v-if="k" class="mx-1.5 text-muted-foreground">/</span>
                  <button
                    type="button" :aria-pressed="plan.salaryBy === o.value" @click="setSalaryBy(o.value)"
                    :class="plan.salaryBy === o.value ? 'font-medium text-foreground' : 'text-muted-foreground underline underline-offset-4 hover:text-foreground'"
                  >{{ o.label }}</button>
                </template>
              </span></div>
              <MoneyInput v-if="plan.salaryBy === 'Ending'" v-model="salaryEnd" aria="Ending salary, a year before tax" />
              <Input v-else v-model="salaryGrowth" type="number" step="0.5" class="h-9" aria-label="Yearly salary growth, %" />
            </div>
            <Field v-model="plan.salaryCurve" label="Curve" :options="CURVES" />
          </div>
        </section>

        <!-- Savings rate, of take-home: start, end and the curve between -->
        <section class="space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Savings rate, share of take-home invested</h4>
          <div class="grid grid-cols-[1.3fr_1.3fr_1fr] gap-4">
            <Field v-model="rateStart" label="Starting (%)" type="number" min="0" max="100" />
            <Field v-model="rateEnd" label="Ending (%)" type="number" min="0" max="100" />
            <Field v-model="plan.rateCurve" label="Curve" :options="CURVES" />
          </div>
        </section>
      </CardContent>
    </Card>

    <Card class="bg-card border-border shadow-sm">
      <CardHeader class="pb-4">
        <CardTitle class="text-xl">Plan</CardTitle>
        <CardDescription>Each year's monthly salary: savings, expenses and income tax.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <PlanChart :rows="rows" :format="short" />
        <!-- What the plan comes to, and the two assumptions behind it -->
        <p class="text-sm">Saving <span class="font-semibold tabular-nums">{{ rupees(rows[0].monthly) }} → {{ rupees(rows.at(-1).monthly) }}</span> a month: <span class="font-semibold tabular-nums">{{ short(total + (Number(plan.lumpsum) || 0)) }}</span> invested in all, with the {{ short(plan.lumpsum || 0) }} lumpsum.</p>
        <p class="text-xs text-muted-foreground">Salary and savings rate change once a year. Income tax is a flat {{ plan.taxRate }}% for now.</p>
      </CardContent>
    </Card>
  </div>
</template>
