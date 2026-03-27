<script setup lang="ts">
defineProps<{
  hasRuntime: boolean
  isBusy: boolean
  startDisabled: boolean
}>()

const emit = defineEmits<{
  start: []
  check: []
  reset: []
  showCorrection: []
}>()
</script>

<template>
  <header class="intro">
    <div>
      <p class="eyebrow">
        Docs Lab
      </p>
      <h1>Interactive rstore tutorial</h1>
      <p class="lede">
        Each chapter restores its own files, runs in an in-browser sandbox, and links the hands-on work back to the rest of the rstore guide. Some chapters have you edit code, others pause to explain how the bigger pieces fit together before you move on.
      </p>
    </div>

    <div class="intro-actions">
      <button
        class="primary"
        :disabled="isBusy || startDisabled"
        @click="emit('start')"
      >
        {{ hasRuntime ? 'Restart tutorial' : 'Start tutorial' }}
      </button>

      <button
        class="secondary"
        :disabled="isBusy"
        @click="emit('check')"
      >
        Check chapter
      </button>

      <button
        class="ghost"
        :disabled="isBusy"
        @click="emit('reset')"
      >
        Reset chapter
      </button>

      <button
        class="ghost"
        :disabled="isBusy"
        @click="emit('showCorrection')"
      >
        Show correction
      </button>
    </div>
  </header>
</template>
