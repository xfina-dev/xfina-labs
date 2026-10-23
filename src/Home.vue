<script setup>
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from 'xfina-ui';
import AppShell from '@/components/AppShell.vue';

const tools = [
  { path: '/portfolio-engine/', name: 'Portfolio Engine', desc: 'Backtest an asset mix the way you\'d actually invest: a lumpsum, then a share of your salary every month, rebalanced by the rules you choose. Runs in your browser.', status: 'design mock' },
];
</script>

<template>
  <AppShell>
    <div class="grid gap-8 md:grid-cols-2">
      <a v-for="t in tools" :key="t.path" :href="t.path" class="no-underline">
        <Card class="bg-card border-border shadow-sm hover:border-primary/40 transition-colors h-full">
          <CardHeader class="pb-4">
            <CardTitle class="flex items-center gap-2"><span>{{ t.name }}</span><Badge variant="warning">{{ t.status }}</Badge></CardTitle>
            <CardDescription>{{ t.desc }}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </a>
    </div>
  </AppShell>
</template>
