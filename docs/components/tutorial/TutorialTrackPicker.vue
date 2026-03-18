<script setup lang="ts">
import type { TutorialFramework, TutorialTrackSummary } from './utils/types'
import { Icon } from '@iconify/vue'

defineProps<{
  tracks: TutorialTrackSummary[]
  selectedFramework: TutorialFramework
  isBusy: boolean
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  selectFramework: [framework: TutorialFramework]
}>()
</script>

<template>
  <section
    v-if="open"
    class="fixed inset-0 top-16 z-40 overflow-y-auto bg-[color-mix(in_srgb,var(--vp-c-bg)_92%,white_8%)] backdrop-blur-sm"
  >
    <div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between gap-4">
        <h1 class="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50 !m-0">
          Choose a tutorial track
        </h1>

        <button
          type="button"
          class="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-white/85 text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950/85 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
          aria-label="Close track picker"
          @click="emit('close')"
        >
          <Icon icon="lucide:x" class="size-5" />
        </button>
      </div>

      <div class="mt-8 grid grid-cols-1 gap-4 pb-6 md:grid-cols-2 xl:gap-5">
        <button
          v-for="track in tracks"
          :key="track.framework"
          type="button"
          class="group relative flex flex-col overflow-hidden rounded-[1.5rem] border bg-white/90 p-5 text-left shadow-[0_24px_80px_-48px_rgba(15,23,42,0.55)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_32px_90px_-42px_rgba(15,23,42,0.45)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-950/80"
          :class="track.framework === selectedFramework
            ? 'border-(--vp-c-brand-1) ring-2 ring-[color-mix(in_srgb,var(--vp-c-brand-1)_20%,transparent)]'
            : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600'"
          @click="emit('selectFramework', track.framework)"
        >
          <div class="relative flex flex-1 flex-col">
            <div class="flex items-start justify-between gap-4">
              <div class="flex min-w-0 items-start gap-4">
                <div class="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white/95 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/95">
                  <img
                    :src="track.imageSrc"
                    :alt="`${track.label} logo`"
                    class="size-8 object-contain"
                  >
                </div>

                <div class="min-w-0 space-y-1 pt-1">
                  <h2 class="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                    {{ track.label }}
                  </h2>
                  <p class="max-w-xl text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                    {{ track.description }}
                  </p>
                </div>
              </div>

              <span
                v-if="track.framework === selectedFramework"
                class="inline-flex items-center rounded-full border border-zinc-300 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-300 flex-none"
              >
                Last used
              </span>
            </div>

            <div class="mt-5 flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <span class="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/70">
                <Icon icon="lucide:book-open" class="size-4" />
                {{ track.chapterCount }} chapters
              </span>
            </div>

            <div class="mt-auto pt-7">
              <span class="inline-flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Enter track
                <Icon icon="lucide:arrow-right" class="size-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  </section>
</template>
