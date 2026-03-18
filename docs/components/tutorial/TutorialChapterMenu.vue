<script setup lang="ts">
import type { FuseResult } from 'fuse.js'
import type { TutorialChapterGroup } from './utils/types'
import { Icon } from '@iconify/vue'
import { useFuse } from '@vueuse/integrations/useFuse'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createTutorialSearchSegments, createTutorialSearchSnippet } from './utils'

const props = defineProps<{
  open: boolean
  groupedChapters: TutorialChapterGroup[]
  activeChapterId: string
  completedChapterIds: string[]
}>()

const emit = defineEmits<{
  close: []
  selectChapter: [index: number]
}>()

interface TutorialChapterSearchEntry {
  index: number
  id: string
  group: string
  title: string
  feature: string
  guideSearchText: string
}

const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const search = ref('')
const completedChapterIds = computed(() => new Set(props.completedChapterIds))
const hasSearch = computed(() => search.value.trim().length > 0)
const searchEntries = computed<TutorialChapterSearchEntry[]>(() =>
  props.groupedChapters.flatMap(group => group.chapters.map(entry => ({
    index: entry.index,
    id: entry.chapter.id,
    group: group.group,
    title: entry.chapter.title,
    feature: entry.chapter.feature,
    guideSearchText: entry.chapter.guideSearchText,
  }))),
)

const { results } = useFuse(search, searchEntries, {
  fuseOptions: {
    keys: ['title', 'feature', 'group', 'guideSearchText'],
    includeMatches: true,
    ignoreLocation: true,
    threshold: 0.35,
  },
})

const searchResults = computed(() =>
  results.value.map(result => ({
    entry: result.item,
    titleSegments: createTutorialSearchSegments(result.item.title, getMatchIndices(result, 'title')),
    featureSegments: createTutorialSearchSegments(result.item.feature, getMatchIndices(result, 'feature')),
    guideSnippet: createTutorialSearchSnippet(result.item.guideSearchText, getMatchIndices(result, 'guideSearchText')),
  })),
)

function isChapterCompleted(chapterId: string) {
  return completedChapterIds.value.has(chapterId)
}

function getMatchIndices(result: FuseResult<TutorialChapterSearchEntry>, key: keyof TutorialChapterSearchEntry) {
  return result.matches
    ?.filter(match => match.key === key)
    .flatMap(match => match.indices)
    ?? []
}

function selectChapter(index: number) {
  emit('selectChapter', index)
}

function handlePointerDown(event: MouseEvent) {
  if (!props.open)
    return

  const target = event.target
  if (target instanceof Node && root.value?.contains(target))
    return

  emit('close')
}

function handleKeyDown(event: KeyboardEvent) {
  if (!props.open)
    return

  if (event.key === 'Escape') {
    emit('close')
  }
}

watch(() => props.open, async (open) => {
  if (!open)
    return

  search.value = ''
  await nextTick()
  searchInput.value?.focus()
}, {
  flush: 'post',
})

onMounted(() => {
  document.addEventListener('mousedown', handlePointerDown)
  document.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handlePointerDown)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div
    v-if="open"
    ref="root"
    class="absolute left-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
  >
    <div class="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
        Table of contents
      </p>

      <label class="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 transition focus-within:border-zinc-400 focus-within:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:focus-within:border-zinc-600 dark:focus-within:bg-zinc-950">
        <Icon icon="lucide:search" class="size-4 shrink-0" />
        <input
          ref="searchInput"
          v-model="search"
          type="search"
          placeholder="Search chapters and guides"
          aria-label="Search tutorial chapters and guides"
          autofocus
          class="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        >
      </label>
    </div>

    <div class="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto p-3">
      <template v-if="!hasSearch">
        <section
          v-for="group in groupedChapters"
          :key="group.group"
          class="mb-3 last:mb-0"
        >
          <h2 class="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            {{ group.group }}
          </h2>

          <div class="grid gap-1">
            <button
              v-for="entry in group.chapters"
              :key="entry.chapter.id"
              type="button"
              class="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
              :class="entry.chapter.id === activeChapterId
                ? 'bg-zinc-100 dark:bg-zinc-900'
                : ''"
              @click="selectChapter(entry.index)"
            >
              <span
                class="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
                :class="isChapterCompleted(entry.chapter.id)
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : entry.chapter.id === activeChapterId
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                    : 'border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400'"
              >
                <Icon
                  v-if="isChapterCompleted(entry.chapter.id)"
                  icon="lucide:check"
                  class="size-3"
                />
                <span v-else>{{ entry.index + 1 }}</span>
              </span>

              <span class="min-w-0">
                <span class="block text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  {{ entry.chapter.title }}
                </span>
                <span class="mt-1 block text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                  {{ entry.chapter.feature }}
                </span>
              </span>
            </button>
          </div>
        </section>
      </template>

      <div v-else-if="searchResults.length" class="grid gap-1">
        <button
          v-for="result in searchResults"
          :key="result.entry.id"
          type="button"
          class="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
          :class="result.entry.id === activeChapterId
            ? 'bg-zinc-100 dark:bg-zinc-900'
            : ''"
          @click="selectChapter(result.entry.index)"
        >
          <span
            class="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
            :class="isChapterCompleted(result.entry.id)
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : result.entry.id === activeChapterId
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                : 'border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400'"
          >
            <Icon
              v-if="isChapterCompleted(result.entry.id)"
              icon="lucide:check"
              class="size-3"
            />
            <span v-else>{{ result.entry.index + 1 }}</span>
          </span>

          <span class="min-w-0">
            <span class="block text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              {{ result.entry.group }}
            </span>

            <span class="mt-1 block text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              <template v-for="(segment, index) in result.titleSegments" :key="`${result.entry.id}-title-${index}`">
                <mark
                  v-if="segment.highlighted"
                  class="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/30"
                >
                  {{ segment.text }}
                </mark>
                <span v-else>{{ segment.text }}</span>
              </template>
            </span>

            <span class="mt-1 block text-sm leading-5 text-zinc-600 dark:text-zinc-300">
              <template v-for="(segment, index) in result.featureSegments" :key="`${result.entry.id}-feature-${index}`">
                <mark
                  v-if="segment.highlighted"
                  class="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/30"
                >
                  {{ segment.text }}
                </mark>
                <span v-else>{{ segment.text }}</span>
              </template>
            </span>

            <span
              v-if="result.guideSnippet"
              class="mt-2 block text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              <span v-if="result.guideSnippet.leadingEllipsis">...</span>
              <template v-for="(segment, index) in result.guideSnippet.segments" :key="`${result.entry.id}-guide-${index}`">
                <mark
                  v-if="segment.highlighted"
                  class="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/30"
                >
                  {{ segment.text }}
                </mark>
                <span v-else>{{ segment.text }}</span>
              </template>
              <span v-if="result.guideSnippet.trailingEllipsis">...</span>
            </span>
          </span>
        </button>
      </div>

      <div
        v-else
        class="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
      >
        No chapter guides match this search.
      </div>
    </div>
  </div>
</template>
