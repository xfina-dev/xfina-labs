<script setup>
import AppShell from '@/components/AppShell.vue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Tag from '@/backtest/Tag.vue';

const tools = [
  { path: '/backtest/', name: 'Portfolio Engine', desc: 'Multi-asset portfolio engine. Bring your own price data; test weights, rebalancing and cash flows.', status: 'design mock' },
];
</script>

<template>
  <AppShell>
    <div class="grid gap-8 md:grid-cols-2">
      <a v-for="t in tools" :key="t.path" :href="t.path" class="no-underline">
        <Card class="bg-card border-border shadow-sm hover:border-primary/40 transition-colors h-full">
          <CardHeader class="pb-4">
            <CardTitle class="flex items-center gap-2"><span>{{ t.name }}</span><Tag variant="warn">{{ t.status }}</Tag></CardTitle>
            <CardDescription>{{ t.desc }}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </a>
    </div>
  </AppShell>
</template>
