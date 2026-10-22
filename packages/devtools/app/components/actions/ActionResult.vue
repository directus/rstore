<script setup lang="ts">
import { computed } from 'vue'
import { useInspector } from '../../stores/connection'
import { sameTarget } from '../../stores/selection'
import PreviewValue from '../preview/PreviewValue.vue'
/** Only current target outcome appears, stale completions cannot create new-target feedback. */
const { state } = useInspector()
/** Outcome fenced by complete target identity. */
const outcome = computed(() => state.outcome && sameTarget(state.outcome.command.target, state.selection.target)
  ? state.outcome
  : null)
/** Retained selected-target command records remain inspectable after switching stores. */
const records = computed(() => state.outcomes.filter(record => sameTarget(record.command.target, state.selection.target)))
</script>

<template>
  <section v-if="outcome" class="action-result" role="status">
    <strong>{{ outcome.status === 'accepted' ? 'Accepted · queued' : outcome.status }}</strong>
    <code>{{ outcome.command.commandId }}</code>
    <p v-if="outcome.error">
      {{ outcome.error }}
    </p>
    <p v-if="outcome.status === 'unknown'">
      Outcome unknown. Refresh data before submitting another action.
    </p>
    <PreviewValue v-if="outcome.result?.result !== undefined" :value="outcome.result.result" />
  </section>
  <details v-if="records.length" class="action-result">
    <summary>Commands · {{ records.length }}</summary>
    <ol>
      <li v-for="record in records" :key="record.command.commandId">
        {{ record.command.action }} · {{ record.status }} <code>{{ record.command.commandId }}</code>
        <p v-if="record.error">
          {{ record.error }}
        </p>
      </li>
    </ol>
  </details>
</template>
