<script setup lang="ts">
import type { TutorialValidationResult } from './utils/types'

defineProps<{
  validation: TutorialValidationResult | null
  isBusy: boolean
  canAdvance: boolean
}>()

const emit = defineEmits<{
  check: []
  showCorrection: []
  next: []
}>()
</script>

<template>
  <article class="surface-card validation-card">
    <div class="section-head compact">
      <div>
        <p class="eyebrow">
          Validation
        </p>
        <h2>{{ validation?.summary ?? 'Check this chapter when you are ready.' }}</h2>
      </div>

      <button
        class="primary"
        :disabled="isBusy"
        @click="emit('check')"
      >
        Run validation
      </button>
    </div>

    <ul v-if="validation?.details.length" class="feedback-list">
      <li
        v-for="detail in validation.details"
        :key="detail"
      >
        {{ detail }}
      </li>
    </ul>

    <p v-else class="hint">
      Validation is behavioral first. The correction diff is always available if you want to compare your current code with the solution snapshot.
    </p>

    <div class="toolbar-inline">
      <button
        class="secondary"
        :disabled="isBusy"
        @click="emit('showCorrection')"
      >
        Show correction
      </button>

      <button
        class="ghost"
        :disabled="!canAdvance"
        @click="emit('next')"
      >
        Next chapter
      </button>
    </div>
  </article>
</template>
