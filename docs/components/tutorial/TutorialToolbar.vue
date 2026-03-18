<script setup lang="ts">
import type { TutorialAdjacentChapter, TutorialChapterGroup } from './utils/types'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import ToolbarButton from './ToolbarButton.vue'
import TutorialChapterMenu from './TutorialChapterMenu.vue'

const props = defineProps<{
  previousChapter: TutorialAdjacentChapter | null
  nextChapter: TutorialAdjacentChapter | null
  chapterIndex: number
  totalChapters: number
  groupedChapters: TutorialChapterGroup[]
  activeChapterId: string
  completedChapterIds: string[]
  isBusy: boolean
}>()

const emit = defineEmits<{
  previous: []
  next: []
  selectChapter: [index: number]
  openTrackPicker: []
}>()

const showChapterMenu = ref(false)

function toggleChapterMenu() {
  showChapterMenu.value = !showChapterMenu.value
}

function closeChapterMenu() {
  showChapterMenu.value = false
}

function selectChapter(index: number) {
  closeChapterMenu()
  emit('selectChapter', index)
}
</script>

<template>
  <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex flex-wrap gap-1 items-center">
      <ToolbarButton
        @click="emit('openTrackPicker')"
      >
        <Icon icon="lucide:layout-grid" />
        Tracks
      </ToolbarButton>

      <div class="relative">
        <ToolbarButton
          class="size-8 justify-center px-0"
          :aria-expanded="showChapterMenu"
          aria-label="Open chapter table of contents"
          title="Open chapter table of contents"
          @click="toggleChapterMenu()"
        >
          <Icon icon="lucide:list" class="text-base" />
        </ToolbarButton>

        <TutorialChapterMenu
          :open="showChapterMenu"
          :grouped-chapters="groupedChapters"
          :active-chapter-id="activeChapterId"
          :completed-chapter-ids="completedChapterIds"
          @close="closeChapterMenu()"
          @select-chapter="selectChapter($event)"
        />
      </div>

      <ToolbarButton
        :disabled="!previousChapter"
        @click="emit('previous')"
      >
        <Icon icon="lucide:arrow-left" />
        Previous
      </ToolbarButton>

      <ToolbarButton
        :disabled="!nextChapter"
        @click="emit('next')"
      >
        Next
        <Icon icon="lucide:arrow-right" />
      </ToolbarButton>
    </div>

    <div class="flex items-baseline gap-2 text-left px-2">
      <span class="text-[11px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Chapter {{ props.chapterIndex }} / {{ props.totalChapters }}</span>
    </div>
  </header>
</template>
