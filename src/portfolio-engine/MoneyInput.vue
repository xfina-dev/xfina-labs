<script setup>
import { ref, watch } from 'vue';
import { Input, Label, Segmented } from 'xfina-ui';

// A rupee amount, typed as a number and a unit joined in one box: [15][Cr|L|k] is ₹15 lakh. As in the RealValue
// SIP Engine, picking another unit keeps the number and changes the amount (15 L → 15 Cr). The label shows the
// amount in full, so a slip of the unit is easy to see. The model is in rupees.
const props = defineProps({
  label: { type: String, default: undefined }, // without one, just the box (when something else labels it)
  aria: { type: String, default: undefined }, // the input's name for screen readers, when the label isn't enough
});
const value = defineModel({ type: [Number, String], default: 0 });

const UNITS = [{ value: 1e7, label: 'Cr' }, { value: 1e5, label: 'L' }, { value: 1e3, label: 'k' }];
// The unit an amount reads best in: crores from one crore, lakhs from one lakh, thousands below.
const unitFor = (v) => (Math.abs(v) >= 1e7 ? 1e7 : Math.abs(v) >= 1e5 ? 1e5 : 1e3);
const round = (x) => Math.round(x * 100) / 100;
const unit = ref(unitFor(Number(value.value) || 0));
const number = ref(round((Number(value.value) || 0) / unit.value));

// Typing sets the amount; another unit keeps the number; an amount set from outside (a reset) is shown afresh.
const setNumber = (v) => { number.value = v; value.value = v === '' ? '' : round(Number(v) * unit.value); };
watch(unit, (u) => { if (number.value !== '') value.value = round(Number(number.value) * u); });
watch(value, (v) => {
  if (v === '' || round(Number(number.value) * unit.value) === Number(v)) return;
  unit.value = unitFor(Number(v));
  number.value = round(Number(v) / unit.value);
});
const full = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
</script>

<template>
  <div :class="label && 'space-y-1.5'">
    <Label v-if="label" class="text-muted-foreground">{{ label }} <span class="font-normal tabular-nums">{{ full(value) }}</span></Label>
    <div class="flex">
      <Input
        :model-value="number" type="number" min="0" step="any" inputmode="decimal" class="h-9 min-w-0 rounded-r-none tabular-nums"
        :aria-label="aria ?? label" @update:model-value="setNumber"
      />
      <Segmented v-model="unit" :options="UNITS" :label="`${aria ?? label}: unit`" class="shrink-0 rounded-l-none border-l-0 [&>button]:px-2" />
    </div>
  </div>
</template>
