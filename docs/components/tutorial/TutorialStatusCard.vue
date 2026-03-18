<script setup lang="ts">
import type { TutorialChapterGroup } from './utils/types'
import { computed } from 'vue'

const props = defineProps<{
  groupedChapters: TutorialChapterGroup[]
  activeChapterId: string
  completedChapterIds: string[]
  isBusy: boolean
  statusMessage: string
}>()

const emit = defineEmits<{
  selectChapter: [index: number]
}>()

const completedChapterIds = computed(() => new Set(props.completedChapterIds))

function isChapterCompleted(chapterId: string) {
  return completedChapterIds.value.has(chapterId)
}
</script>

<template>
  <section class="surface-card">
    <div class="status-bar">
      <strong>Status</strong>
      <span>{{ statusMessage }}</span>
    </div>

    <div class="step-groups">
      <div
        v-for="group in groupedChapters"
        :key="group.group"
        class="step-group"
      >
        <div class="step-group-title">
          {{ group.group }}
        </div>

        <div class="step-list">
          <button
            v-for="entry in group.chapters"
            :key="entry.chapter.id"
            class="step-chip"
            :class="{
              active: entry.chapter.id === activeChapterId,
              done: isChapterCompleted(entry.chapter.id),
            }"
            :disabled="isBusy"
            @click="emit('selectChapter', entry.index)"
          >
            <span class="step-chip-title">{{ entry.chapter.title }}</span>
            <span class="step-chip-feature">{{ entry.chapter.feature }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
