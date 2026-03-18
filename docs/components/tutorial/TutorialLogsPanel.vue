<script setup lang="ts">
import type { TutorialLogEntry } from './utils/tutorialRuntimeLogs'

defineProps<{
  logs: TutorialLogEntry[]
}>()
</script>

<template>
  <article class="surface-card logs-card">
    <div class="section-head compact">
      <div>
        <p class="eyebrow">
          Logs
        </p>
        <h2>Sandbox output</h2>
      </div>
    </div>

    <pre>{{ logs.map(log => log.text).join('\n') || 'No logs yet. Start the tutorial to boot the sandbox and stream the terminal output here.' }}</pre>
  </article>
</template>
