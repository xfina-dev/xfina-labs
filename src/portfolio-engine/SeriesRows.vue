<script setup>
// One series, as a pair of table rows: what it is and what it covers, then its
// chart in the row directly beneath when it is open.
//
// Written once because the Series screen holds two kinds of series and they are
// the same thing to look at. What you hold is files the user imported; what
// comes with the tool is published by Xfina Data and fetched. They differ in
// provenance, in what the first column says about them, and in where their rows
// come from -- not in what looking at one should be like. Two copies of this
// shape would drift, which is the lesson catalogue.js already taught here.
//
// The first cell is a slot, because that is the part that genuinely differs:
// an imported series says which catalogue instrument it is and may still be
// asking which, while a published one names its publisher.
import { SeriesExplorer } from 'xfina-ui/series-explorer';
import { Badge, Button, TableCell, TableRow } from 'xfina-ui';
import { tone } from './tone.js';

defineProps({
  from: { type: String, default: null },
  to: { type: String, default: null },
  // What a row counts: files for an imported series, nothing for a published
  // one, which is always a single file.
  files: { type: Number, default: null },
  // `[variant, label]`, or null where there is nothing to check.
  status: { type: Array, default: null },
  open: { type: Boolean, default: false },
  label: { type: String, required: true },
  // Everything the explorer needs, assembled by whichever box owns the row.
  explorer: { type: Object, default: null },
  // Said in the row rather than drawn as an empty chart.
  problem: { type: String, default: null },
});
defineEmits(['toggle']);
</script>

<template>
  <TableRow>
    <TableCell><slot name="name" /></TableCell>
    <TableCell class="whitespace-nowrap font-mono text-xs">{{ from }} → {{ to }}</TableCell>
    <TableCell class="text-right tabular-nums text-muted-foreground">{{ files ?? '—' }}</TableCell>
    <TableCell><Badge v-if="status" :variant="tone(status[0])">{{ status[1] }}</Badge></TableCell>
    <TableCell class="text-right whitespace-nowrap">
      <Button
        size="sm" :variant="open ? 'secondary' : 'outline'"
        :title="`Chart, calendar and values for ${label}`" @click="$emit('toggle')"
      >{{ open ? 'Close' : 'View' }}</Button>
    </TableCell>
  </TableRow>

  <!-- Opened from the row above and drawn under it, beside the series it is of -->
  <TableRow v-if="open" class="hover:bg-transparent">
    <TableCell colspan="5" class="p-0">
      <div class="border-y bg-muted/20 p-3">
        <p v-if="problem" class="py-6 text-center text-sm text-status-warning-text">{{ problem }}</p>
        <SeriesExplorer v-else v-bind="explorer" />
      </div>
    </TableCell>
  </TableRow>
</template>
