<script setup>
import { HelpCircle } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// Where to get each kind of series. `gif` is a path under /help/ once a recording exists;
// until then the slot shows a placeholder. Steps and links are placeholders for the mock:
// verify each against the provider before this ships.
const sources = [
  {
    id: 'nse', title: 'Nifty indices (Total Return)', for: 'Nifty 50, Nifty Next 50, Nifty Midcap 150, Nifty Smallcap 250',
    site: 'niftyindices.com', url: 'https://www.niftyindices.com/reports/historical-data',
    steps: ['Open the Historical Data page on NSE Indices.', 'Choose the index and its Total Return series, not the price series.', 'Set the widest date range allowed. If the site caps the range, download in chunks and paste them into one file.', 'Save as CSV, keeping only the date and the index value.'],
    gif: null,
  },
  {
    id: 'etf', title: 'Global equity ETFs and indices', for: 'Nasdaq 100, S&P 500, MSCI World (Irish UCITS ETF or index)',
    site: 'ETF issuer website', url: null,
    steps: ['Open the fund page of the ETF you want to model.', 'Find the NAV history or price history download.', 'Pick the total-return or accumulating share class if there is a choice.', 'Save as CSV with date and NAV. Note the fund currency, you will confirm it after upload.'],
    gif: null,
  },
  {
    id: 'amfi', title: 'Indian mutual fund NAV (debt, gold funds)', for: 'Liquid fund, gilt fund, gold fund of funds',
    site: 'amfiindia.com', url: 'https://www.amfiindia.com/nav-history-download',
    steps: ['Open NAV History on AMFI.', 'Select the fund house, the scheme and the date range.', 'Download the report and keep the date and Net Asset Value columns.', 'Convert dates to YYYY-MM-DD if they are in another format.'],
    gif: null,
  },
  {
    id: 'gold', title: 'Gold', for: 'Gold price or gold ETF (INR or USD)',
    site: 'Gold ETF issuer or a price provider', url: null,
    steps: ['Choose one: an Indian gold ETF (INR) or an international gold price or ETC (USD).', 'Download its daily price or NAV history as CSV.', 'Set the currency after upload. A USD series uses the provided USD/INR.'],
    gif: null,
  },
];
</script>

<template>
  <Dialog>
    <DialogTrigger as-child><slot /></DialogTrigger>
    <DialogContent class="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>How to get your data</DialogTitle>
        <DialogDescription>
          Download history from the original provider, then upload it here. Files are read in your browser and nothing is uploaded.
          USD/INR and inflation are provided, so there is nothing to download for them.
        </DialogDescription>
      </DialogHeader>

      <Accordion type="single" collapsible default-value="nse" class="w-full">
        <AccordionItem v-for="s in sources" :key="s.id" :value="s.id">
          <AccordionTrigger class="text-left">
            <div>
              <div class="font-semibold">{{ s.title }}</div>
              <div class="text-xs font-normal text-muted-foreground">{{ s.for }}</div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div class="grid gap-4 md:grid-cols-2 items-start">
              <ol class="list-decimal pl-5 space-y-1.5 text-sm">
                <li v-for="(step, i) in s.steps" :key="i">{{ step }}</li>
              </ol>
              <figure class="space-y-1.5">
                <img v-if="s.gif" :src="`/help/${s.gif}`" :alt="`Steps to download ${s.title}`" class="rounded-md border w-full" />
                <div v-else class="aspect-video rounded-md border border-dashed bg-muted/40 grid place-items-center text-xs text-muted-foreground text-center p-4">
                  GIF walkthrough goes here<br /><span class="font-mono">/help/{{ s.id }}.gif</span>
                </div>
                <figcaption class="text-xs text-muted-foreground">
                  Source:
                  <a v-if="s.url" :href="s.url" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-foreground">{{ s.site }}</a>
                  <span v-else>{{ s.site }}</span>
                </figcaption>
              </figure>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="format" class="border-b-0">
          <AccordionTrigger class="text-left"><div class="font-semibold">File format</div></AccordionTrigger>
          <AccordionContent>
            <div class="text-sm space-y-2">
              <p>One series per CSV. Two columns are enough, dates as <code class="font-mono">YYYY-MM-DD</code>, oldest first.</p>
              <pre class="rounded-md border bg-muted/40 p-3 text-xs font-mono overflow-x-auto">date,value
2020-01-01,100.23
2020-01-02,101.12</pre>
              <p class="text-muted-foreground">Return type (total return, adjusted or price only) and currency are never guessed. You confirm them after upload.</p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </DialogContent>
  </Dialog>
</template>
