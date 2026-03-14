<script setup lang="ts">
import type { TutorialStep } from './utils/types'
import { Icon } from '@iconify/vue'
import ToolbarButton from './ToolbarButton.vue'

defineProps<{
  step: TutorialStep
  canGoBack: boolean
  canGoForward: boolean
  isBusy: boolean
}>()

const emit = defineEmits<{
  previous: []
  next: []
}>()
</script>

<template>
  <article class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 overflow-y-auto gap-4 p-4 pb-12">
    <div class="flex flex-col gap-2 border-b border-zinc-200 dark:border-zinc-800">
      <div class="flex gap-2 items-center font-semibold text-zinc-500 dark:text-zinc-400">
        <p>
          {{ step.group }}
        </p>
        <Icon icon="lucide:chevron-right" class="size-4 opacity-50" />
        <h2 class="text-base">
          {{ step.title }}
        </h2>
      </div>

      <p class="leading-6 font-semibold text-zinc-950 dark:text-zinc-100">
        {{ step.feature }}
      </p>
    </div>

    <div class="tutorial-guide vp-doc">
      <component :is="step.guideComponent" />
    </div>

    <div class="flex flex-wrap gap-2 items-baseline">
      <div>
        Learn more
      </div>
      <a
        v-for="link in step.referenceLinks"
        :key="link.href"
        :href="link.href"
        target="_blank"
        class="inline-flex gap-1 rounded-md border border-zinc-300 px-1 py-0.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:text-white"
      >
        {{ link.label }}
        <Icon
          icon="lucide:external-link"
          size="size-4"
        />
      </a>
    </div>

    <div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Ready to keep moving?
      </p>

      <div class="flex flex-wrap gap-2">
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
      </div>
    </div>
  </article>
</template>

<style scoped>
.tutorial-guide:deep(.header-anchor) {
  display: none;
}

.tutorial-guide:deep(h1:first-child),
.tutorial-guide:deep(h2:first-child) {
  margin-top: 0;
}
</style>
