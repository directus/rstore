<script setup lang="ts">
import type { TutorialStepGroup } from './utils/types'
import { computed } from 'vue'

const props = defineProps<{
  groupedSteps: TutorialStepGroup[]
  activeStepId: string
  completedStepIds: string[]
  isBusy: boolean
  statusMessage: string
}>()

const emit = defineEmits<{
  selectStep: [index: number]
}>()

const completedStepIds = computed(() => new Set(props.completedStepIds))

function isStepCompleted(stepId: string) {
  return completedStepIds.value.has(stepId)
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
        v-for="group in groupedSteps"
        :key="group.group"
        class="step-group"
      >
        <div class="step-group-title">
          {{ group.group }}
        </div>

        <div class="step-list">
          <button
            v-for="entry in group.steps"
            :key="entry.step.id"
            class="step-chip"
            :class="{
              active: entry.step.id === activeStepId,
              done: isStepCompleted(entry.step.id),
            }"
            :disabled="isBusy"
            @click="emit('selectStep', entry.index)"
          >
            <span class="step-chip-title">{{ entry.step.title }}</span>
            <span class="step-chip-feature">{{ entry.step.feature }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
