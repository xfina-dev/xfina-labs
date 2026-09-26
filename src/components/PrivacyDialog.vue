<script setup>
import { ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { GA_MEASUREMENT_ID, LEVEL_OFF, LEVEL_ANONYMOUS, getStoredAnalyticsLevel, setStoredAnalyticsLevel } from '@/lib/analytics.js';

const level = ref(getStoredAnalyticsLevel());
const setLevel = (l) => {
  level.value = l;
  setStoredAnalyticsLevel(l);
};

// Never a portfolio, an amount, a filename or a result: only what happened, and how big.
const payload = [
  ['v', 'Standard GA4 protocol version', '2'],
  ['tid', 'Google Analytics measurement ID', GA_MEASUREMENT_ID],
  ['cid', 'Randomly generated session ID. Resets on every page load; never stored.', '1834920.1790…'],
  ['en', 'Event: dataset_validation_failed, backtest_started or backtest_completed', 'backtest_completed'],
  ['ep.app_version', 'Labs version', '0.1.0'],
  ['epn.assets', 'How many assets, not which ones', '6'],
  ['epn.run_time_ms', 'How long the run took', '412'],
];
</script>

<template>
  <Dialog>
    <DialogTrigger as-child><slot /></DialogTrigger>
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Privacy &amp; Analytics</DialogTitle>
        <DialogDescription>
          <strong>Help Improve Xfina Labs.</strong> Your files, weights, amounts and results never leave your browser.
          The only thing that can be sent is a count of what happened.
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-4 py-4">
        <div
          class="flex items-center space-x-2 p-2 border rounded-md cursor-pointer hover:bg-muted"
          :class="{ 'border-primary bg-primary/5': level === LEVEL_ANONYMOUS }"
          @click="setLevel(LEVEL_ANONYMOUS)"
        >
          <div class="flex-1 w-full">
            <Accordion type="single" collapsible class="w-full">
              <AccordionItem value="payload" class="border-b-0">
                <div class="flex items-center justify-between w-full">
                  <div class="font-semibold text-base flex items-center">
                    Anonymous Usage Statistics
                    <span class="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold ml-2 tracking-wide">Recommended</span>
                  </div>
                  <div @click.stop>
                    <AccordionTrigger class="group hover:no-underline p-0 data-[state=open]:border-b-0">
                      <span class="sr-only">View exact payload details</span>
                      <template #icon>
                        <div class="flex items-center gap-1.5 text-xs font-mono bg-primary/10 text-primary pl-2.5 pr-2 py-1.5 rounded shrink-0 ml-2 hover:bg-primary/20 transition-colors">
                          <span>Payload</span>
                          <ChevronDown class="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </div>
                      </template>
                    </AccordionTrigger>
                  </div>
                </div>
                <div class="text-sm text-muted-foreground mt-2">
                  <p>Help us see which tools get used and where dataset validation fails. <strong>No personal or financial data is collected.</strong></p>
                </div>
                <div class="mt-3" @click.stop>
                  <AccordionContent>
                    <div class="max-h-[300px] overflow-y-auto pr-2">
                      <div class="rounded-md border overflow-hidden bg-background">
                        <table class="w-full text-left text-sm">
                          <thead class="bg-muted/50 text-muted-foreground">
                            <tr>
                              <th class="px-2 py-1.5 font-medium border-b whitespace-nowrap">Query Param</th>
                              <th class="px-2 py-1.5 font-medium border-b w-full">Description</th>
                              <th class="px-2 py-1.5 font-medium border-b w-1/4">Example Value</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y">
                            <tr v-for="[k, d, e] in payload" :key="k">
                              <td class="px-2 py-1.5 font-mono text-primary/80">{{ k }}</td>
                              <td class="px-2 py-1.5">{{ d }}</td>
                              <td class="px-2 py-1.5 font-mono">{{ e }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </AccordionContent>
                </div>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
        <div
          class="flex items-center space-x-2 p-2 border rounded-md cursor-pointer hover:bg-muted"
          :class="{ 'border-primary bg-primary/5': level === LEVEL_OFF }"
          @click="setLevel(LEVEL_OFF)"
        >
          <div class="flex-1">
            <div class="font-semibold text-base">Zero Usage Statistics</div>
            <div class="text-sm text-muted-foreground mt-1">Opt-out completely. No telemetry requests will be sent from your browser.</div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
