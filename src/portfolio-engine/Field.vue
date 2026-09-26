<script setup>
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// One labelled control: a Select when `options` is given, otherwise an Input.
const props = defineProps({
  label: String,
  modelValue: [String, Number],
  options: Array,
  disabled: Boolean,
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="space-y-1.5">
    <Label class="text-muted-foreground"><slot name="label">{{ label }}</slot></Label>
    <Select v-if="options" :modelValue="modelValue" :disabled="disabled" @update:modelValue="$emit('update:modelValue', $event)">
      <SelectTrigger class="h-9 bg-background shadow-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectGroup><SelectItem v-for="o in options" :key="o" :value="o">{{ o }}</SelectItem></SelectGroup>
      </SelectContent>
    </Select>
    <Input v-else :modelValue="modelValue" :disabled="disabled" class="h-9" @update:modelValue="$emit('update:modelValue', $event)" />
  </div>
</template>
