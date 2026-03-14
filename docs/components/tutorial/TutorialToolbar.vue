<script setup lang="ts">
import { Icon } from '@iconify/vue'
import ToolbarButton from './ToolbarButton.vue'

defineProps<{
  canGoBack: boolean
  canGoForward: boolean
  isBusy: boolean
  stepIndex: number
  totalSteps: number
}>()

const emit = defineEmits<{
  previous: []
  next: []
  showCorrection: []
}>()
</script>

<template>
  <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex flex-wrap gap-1">
      <ToolbarButton
        :disabled="isBusy || !canGoBack"
        @click="emit('previous')"
      >
        <Icon icon="lucide:arrow-left" />
        Previous
      </ToolbarButton>

      <ToolbarButton
        :disabled="isBusy || !canGoForward"
        @click="emit('next')"
      >
        Next
        <Icon icon="lucide:arrow-right" />
      </ToolbarButton>

      <ToolbarButton
        :disabled="isBusy"
        @click="emit('showCorrection')"
      >
        Show correction
      </ToolbarButton>
    </div>

    <div class="flex items-baseline gap-2 text-left px-2">
      <span class="text-[11px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Step {{ stepIndex }} / {{ totalSteps }}</span>
    </div>
  </header>
</template>
