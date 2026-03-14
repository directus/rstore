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
        Each step restores its own files, runs in an in-browser Vue + Vite sandbox, and includes a built-in correction diff when you want to compare your work with the expected solution.
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
        Check step
      </button>

      <button
        class="ghost"
        :disabled="isBusy"
        @click="emit('reset')"
      >
        Reset step
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
