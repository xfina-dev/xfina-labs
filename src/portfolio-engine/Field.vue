<script setup>
import { Label, Input, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from 'xfina-ui';

// One labelled control: a Select when `options` (or `groups`: [{ label, options }], shown under their labels
// with a divider between) is given, otherwise an Input (of `type`, text by default).
const props = defineProps({
  label: String,
  modelValue: [String, Number],
  options: Array,
  groups: Array,
  disabled: Boolean,
  type: { type: String, default: 'text' },
  min: String,
  max: String,
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="space-y-1.5">
    <Label class="text-muted-foreground"><slot name="label">{{ label }}</slot></Label>
    <Select v-if="options || groups" :modelValue="modelValue" :disabled="disabled" @update:modelValue="$emit('update:modelValue', $event)">
      <SelectTrigger class="h-9 bg-background shadow-sm"><SelectValue /></SelectTrigger>
      <SelectContent :body-lock="false">
        <template v-if="groups">
          <template v-for="(g, i) in groups" :key="g.label">
            <SelectSeparator v-if="i" />
            <SelectGroup>
              <SelectLabel>{{ g.label }}</SelectLabel>
              <SelectItem v-for="o in g.options" :key="o" :value="o">{{ o }}</SelectItem>
            </SelectGroup>
          </template>
        </template>
        <SelectGroup v-else><SelectItem v-for="o in options" :key="o" :value="o">{{ o }}</SelectItem></SelectGroup>
      </SelectContent>
    </Select>
    <Input v-else :modelValue="modelValue" :type="type" :min="min" :max="max" :disabled="disabled" class="h-9" @update:modelValue="$emit('update:modelValue', $event)" />
  </div>
</template>
