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
import { Trash2 } from 'lucide-vue-next';
import { tone } from './tone.js';

defineProps({
  from: { type: String, default: null },
  to: { type: String, default: null },
  // Where it came from. With the same instrument available from several
  // publishers, this is the column that settles which one you are looking at.
  source: { type: String, default: null },
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
  // Only an imported series can be taken out of this browser, or picked for a
  // run; one that comes with the tool has neither.
  canUse: { type: Boolean, default: false },
  canRemove: { type: Boolean, default: false },
  // Asking before it runs: a series is routinely many files and nothing brings
  // them back.
  confirming: { type: Boolean, default: false },
  files_: { type: Number, default: 0 },
});
defineEmits(['toggle', 'use', 'remove', 'confirm', 'cancel']);
</script>

<template>
  <TableRow>
    <TableCell><slot name="name" /></TableCell>
    <TableCell class="whitespace-nowrap text-sm text-muted-foreground">{{ source || '—' }}</TableCell>
    <TableCell class="whitespace-nowrap font-mono text-xs">{{ from }} → {{ to }}</TableCell>
    <TableCell class="text-right tabular-nums text-muted-foreground">{{ files ?? '—' }}</TableCell>
    <TableCell><Badge v-if="status" :variant="tone(status[0])">{{ status[1] }}</Badge></TableCell>
    <!-- The controls are one group on one line: left to wrap, the column squeezes them onto three. -->
    <TableCell class="text-right whitespace-nowrap">
      <!-- Deleting is asked about in the row it would empty, naming what goes -->
      <div v-if="confirming" class="flex flex-nowrap items-center justify-end gap-2">
        <span class="text-xs">Delete {{ files_ }} file{{ files_ === 1 ? '' : 's' }}?</span>
        <Button size="sm" variant="destructive" class="w-20" @click="$emit('remove')">Delete</Button>
        <Button size="sm" variant="outline" class="w-20" @click="$emit('cancel')">Cancel</Button>
      </div>
      <div v-else class="flex flex-nowrap items-center justify-end gap-2">
        <!-- One width for both labels, so the column does not resize under the pointer when a series opens -->
        <Button
          size="sm" class="w-20" :variant="open ? 'secondary' : 'outline'"
          :title="`Chart, calendar and values for ${label}`" @click="$emit('toggle')"
        >{{ open ? 'Close' : 'View' }}</Button>
        <Button v-if="canUse" size="sm" class="w-20" :title="`Use ${label} in a backtest`" @click="$emit('use')">Use</Button>
        <Button
          v-if="canRemove" size="sm" variant="ghost" class="w-8 px-0 text-muted-foreground hover:text-status-critical-text"
          :title="`Delete every file of ${label} from this browser`" @click="$emit('confirm')"
        ><Trash2 class="h-4 w-4" /></Button>
      </div>
    </TableCell>
  </TableRow>

  <!-- Opened from the row above and drawn under it, beside the series it is of -->
  <TableRow v-if="open" class="hover:bg-transparent">
    <TableCell colspan="6" class="p-0">
      <div class="border-y bg-muted/20 p-3">
        <p v-if="problem" class="py-6 text-center text-sm text-status-warning-text">{{ problem }}</p>
        <SeriesExplorer v-else v-bind="explorer" />
      </div>
    </TableCell>
  </TableRow>
</template>
