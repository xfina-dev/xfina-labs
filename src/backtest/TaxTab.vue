<script setup>
import { ref } from 'vue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Tag from './Tag.vue';
import Seg from './Seg.vue';
import Field from './Field.vue';

const mode = ref('Simple');
</script>

<template>
  <Card class="bg-card border-border shadow-sm">
    <CardHeader class="pb-4">
      <CardTitle class="flex items-center gap-2"><span>Tax</span><Tag variant="soon">later</Tag></CardTitle>
      <CardDescription>A separate, versioned engine that reads the transaction ledger. Not part of the first increments.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid gap-4 md:grid-cols-3">
        <Field model-value="India" label="Country" disabled />
        <Field model-value="FY 2026-27" label="Financial year" disabled />
        <Field model-value="Resident individual" label="Investor profile" disabled />
      </div>
      <Seg v-model="mode" :options="['Simple', 'Detailed (tax lots)']" :disabled="['Detailed (tax lots)']" />
      <p class="text-xs text-muted-foreground">This is a simulation, not a tax computation for filing.</p>
    </CardContent>
  </Card>
</template>
