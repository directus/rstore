<script setup lang="ts">
import TutorialFileTabs from './TutorialFileTabs.vue'

defineProps<{
  open: boolean
  stepTitle: string
  correctionFiles: string[]
  selectedFile: string | null
  isBusy: boolean
}>()

const emit = defineEmits<{
  close: []
  apply: []
  selectFile: [filePath: string]
}>()
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 grid place-items-center bg-zinc-950/40 p-3 backdrop-blur-sm sm:p-6"
    @click.self="emit('close')"
  >
    <section class="flex h-[min(52rem,calc(100dvh-1.5rem))] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:h-[min(56rem,calc(100dvh-3rem))]">
      <div class="flex flex-col gap-4 border-b border-zinc-200 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Correction
          </p>
          <h2 class="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-100">
            {{ stepTitle }}
          </h2>
          <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Compare your current code with the expected solution for this step.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="inline-flex items-center rounded-full border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            :disabled="!correctionFiles.length || isBusy"
            @click="emit('apply')"
          >
            Apply corrections
          </button>

          <button
            class="inline-flex items-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
      </div>

      <TutorialFileTabs
        v-if="correctionFiles.length"
        :files="correctionFiles"
        :selected-file="selectedFile"
        :active-files="correctionFiles"
        active-title="Show this correction diff"
        inactive-title="Show this correction diff"
        class="px-3 py-3"
        @select-file="emit('selectFile', $event)"
      />

      <div v-if="correctionFiles.length" class="flex-1 min-h-0 overflow-hidden">
        <slot />
      </div>

      <div v-else class="grid min-h-72 place-items-center gap-2 p-8 text-center">
        <h3 class="text-base font-semibold text-zinc-950 dark:text-zinc-100">
          No corrections needed
        </h3>
        <p class="max-w-lg text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Your editable files already match the expected solution for this step.
        </p>
      </div>
    </section>
  </div>
</template>
