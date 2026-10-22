<script setup lang="ts">
import type { Target } from '../../src/protocol'
import { computed } from 'vue'
import { useInspector } from '../stores/connection'
import { sameTarget } from '../stores/selection'
/** Published target selection, shared directly with request/action ownership. */
const { state } = useInspector()
/** Selection can inspect request metadata without granting store authority. */
interface TargetOption {
  /** Full store authority, absent for session-only selection. */
  target: Target | null
  /** Published human-readable session/store label. */
  label: string
  /** Session identity independent of store initialization. */
  sessionId: string
}
/** Every option identifies a full session/store/generation tuple. */
const stores = computed(() => state.sessions.flatMap<TargetOption>(session => session.stores.length
  ? session.stores.map(store => ({ target: store.target, label: `${session.label} / ${store.label}${session.kind === 'ssr' ? ' · SSR' : ''}`, sessionId: session.sessionId }))
  : [{ target: null, label: `${session.label}${session.kind === 'ssr' ? ' · SSR' : ''}`, sessionId: session.sessionId }]))
/** Full authority selection encoded only as an option position. */
const selected = computed(() => stores.value.findIndex(store => store.target
  ? sameTarget(store.target, state.selection.target)
  : !state.selection.target && store.sessionId === state.session?.sessionId))
/** Deliberate user selection fences old editors and pending requests. */
function select(event: Event): void {
  const store = stores.value[Number((event.target as HTMLSelectElement).value)]
  if (store)
    void state.select(store.target, store.sessionId)
}
</script>

<template>
  <label class="target-selector">
    <span class="sr-only">Session and store</span>
    <select :value="selected" aria-label="Session and store" @change="select">
      <option :value="-1" disabled>{{ state.selection.unavailable ? 'Selected store unavailable' : 'Select store' }}</option>
      <option v-for="(store, index) in stores" :key="JSON.stringify([store.sessionId, store.target])" :value="index">
        {{ store.label }}
      </option>
    </select>
  </label>
</template>
