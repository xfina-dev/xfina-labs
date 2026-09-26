<script setup>
import { ref } from 'vue';
import { Maximize2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// A wide walkthrough GIF that can also open full screen. It loads /help/<slug>.gif and falls back
// to a placeholder while that file does not exist, so recording a GIF needs no code change:
// drop it into public/help/ under the site's slug.
const props = defineProps({ slug: { type: String, required: true }, title: { type: String, default: '' } });
const src = `/help/${props.slug}.gif`;
const missing = ref(false);
</script>

<template>
  <figure class="relative">
    <div class="aspect-video w-full overflow-hidden rounded-md border bg-muted/40 grid place-items-center">
      <img v-if="!missing" :src="src" :alt="`Walkthrough: ${title}`" class="h-full w-full object-contain" @error="missing = true" />
      <div v-else class="text-center text-xs text-muted-foreground p-4">
        GIF walkthrough goes here<br /><span class="font-mono">{{ src }}</span>
      </div>
    </div>
    <Dialog>
      <DialogTrigger as-child>
        <Button variant="outline" size="sm" class="absolute top-2 right-2 h-8 bg-background/80 backdrop-blur" title="Full screen"><Maximize2 class="h-4 w-4 mr-1.5" />Full screen</Button>
      </DialogTrigger>
      <DialogContent class="sm:max-w-[min(96vw,1400px)] w-[96vw]">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription>Walkthrough</DialogDescription>
        </DialogHeader>
        <div class="aspect-video w-full overflow-hidden rounded-md border bg-muted/40 grid place-items-center">
          <img v-if="!missing" :src="src" :alt="`Walkthrough: ${title}`" class="h-full w-full object-contain" />
          <div v-else class="text-center text-sm text-muted-foreground p-4">GIF walkthrough goes here<br /><span class="font-mono">{{ src }}</span></div>
        </div>
      </DialogContent>
    </Dialog>
  </figure>
</template>
