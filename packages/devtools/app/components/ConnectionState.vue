<script setup lang="ts">
import { computed } from 'vue'
import { useInspector } from '../stores/connection'
/** Shared detached connection and recorded-session state. */
const { state } = useInspector()
/** Connection label distinguishes recorded data from live producer. */
const label = computed(() => state.session?.kind === 'ssr' || state.session?.completed
  ? `${state.session.request?.status === 'active' ? 'SSR' : 'Recorded'}${state.session.request ? ` · ${state.session.request.status}` : ''} · read-only`
  : state.session && !state.session.connected
    ? 'Producer disconnected'
    : ({ 'connecting': 'Connecting', 'live': 'Live', 'disconnected': 'Disconnected', 'authentication-error': 'Authentication failed', 'incompatible': 'Incompatible protocol' }[state.status]))
/** Recorded capture time uses protocol epoch metadata. */
const capturedAt = computed(() => (state.session?.request?.completedAt ?? state.session?.completedAt)
  ? new Date((state.session?.request?.completedAt ?? state.session?.completedAt)!).toLocaleString()
  : '')
</script>

<template>
  <div class="connection-status" role="status">
    <span>{{ label }}</span>
    <time v-if="capturedAt">{{ capturedAt }}</time>
    <span v-if="state.error">{{ state.error }}</span>
  </div>
</template>
