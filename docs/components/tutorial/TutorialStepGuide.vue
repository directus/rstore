<script setup lang="ts">
import type { TutorialAdjacentChapter, TutorialChapter } from './utils/types'
import { Icon } from '@iconify/vue'
import { nextTick, ref, watch } from 'vue'
import TutorialChapterNavCard from './TutorialChapterNavCard.vue'

const props = defineProps<{
  chapter: TutorialChapter
  previousChapter: TutorialAdjacentChapter | null
  nextChapter: TutorialAdjacentChapter | null
}>()

const emit = defineEmits<{
  previous: []
  next: []
}>()

const guideContainer = ref<HTMLElement | null>(null)

watch(() => props.chapter.id, async () => {
  await nextTick()
  guideContainer.value?.scrollTo({ top: 0 })
})
</script>

<template>
  <article
    ref="guideContainer"
    class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 overflow-y-auto gap-4 p-4 pb-12"
  >
    <div class="flex flex-col gap-2 border-b border-zinc-200 dark:border-zinc-800">
      <div class="flex gap-2 items-center font-semibold text-zinc-500 dark:text-zinc-400">
        <p>
          {{ chapter.group }}
        </p>
        <Icon icon="lucide:chevron-right" class="size-4 opacity-50" />
        <h2 class="text-base">
          {{ chapter.title }}
        </h2>
      </div>

      <p class="leading-6 font-semibold text-zinc-950 dark:text-zinc-100">
        {{ chapter.feature }}
      </p>
    </div>

    <div class="tutorial-guide vp-doc">
      <component :is="chapter.guideComponent" />
    </div>

    <div class="flex flex-wrap gap-2 items-baseline">
      <div>
        Learn more
      </div>
      <a
        v-for="link in chapter.referenceLinks"
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

    <div
      v-if="previousChapter || nextChapter"
      class="mt-auto grid gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:grid-cols-2"
    >
      <TutorialChapterNavCard
        v-if="previousChapter"
        label="Previous chapter"
        :chapter-title="previousChapter.chapter.title"
        icon="lucide:arrow-left"
        @click="emit('previous')"
      />

      <TutorialChapterNavCard
        v-if="nextChapter"
        label="Next chapter"
        :chapter-title="nextChapter.chapter.title"
        icon="lucide:arrow-right"
        icon-position="end"
        :class="{ 'sm:col-start-2': !previousChapter }"
        @click="emit('next')"
      />
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
