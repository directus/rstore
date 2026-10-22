<script setup lang="ts">
import type { ConnectionStatus } from './transport/types'
import { onMounted, ref } from 'vue'
import ActionResult from './components/actions/ActionResult.vue'
import ItemActionDialog from './components/actions/ItemActionDialog.vue'
import ConnectionState from './components/ConnectionState.vue'
import ReadViews from './components/devtools/ReadViews.vue'
import SessionRequest from './components/SessionRequest.vue'
import TargetSelector from './components/TargetSelector.vue'
import { useInspector } from './stores/connection'
import { useConnectionOwner } from './stores/connection-owner'
import { errorMessage } from './stores/requests'
import { views } from './stores/views'
import { connectEmbedded, connectRelay } from './transport'

/** Sole reactive inspector state for all tabs and action controls. */
const { state } = useInspector()
/** Component lifetime and each connection attempt own asynchronous completion. */
const owner = useConnectionOwner(state)
/** Relay origin separate from panel asset origin and kept in memory. */
const baseURL = ref('')
/** Explicit interactive credential, never persisted in URL or browser storage. */
const authToken = ref('')
/** Controlled connection form disclosure. */
const showConnection = ref(false)
/** Connection form error remains separate from read errors. */
const connectionError = ref('')
/** Establish explicit external connection using validated HTTP origin. */
async function connect(): Promise<void> {
  connectionError.value = ''
  try {
    if (!await owner.connect(() => connectRelay(baseURL.value, authToken.value || undefined)))
      return
    showConnection.value = (state.status as ConnectionStatus) !== 'live'
  }
  catch (error) {
    connectionError.value = errorMessage(error)
    state.error = connectionError.value
    state.status = (error as { kind?: string })?.kind === 'auth'
      ? 'authentication-error'
      : /protocol/i.test(connectionError.value) ? 'incompatible' : 'disconnected'
  }
}
onMounted(async () => {
  try {
    if (!await owner.connect(connectEmbedded))
      return
  }
  catch { showConnection.value = true }
  if (state.status !== 'live') {
    showConnection.value = true
    // A relay hosted inspector can discover its same-origin descriptor. External
    // assets require user-entered origin; credentials remain explicit.
    baseURL.value = new URL(import.meta.env.BASE_URL, window.location.href).href
    const current = owner.capture()
    try {
      const response = await fetch(new URL('__connection.json', baseURL.value))
      if (response.ok && current())
        await connect()
    }
    catch { /* Connection form retains disconnected state. */ }
  }
})
</script>

<template>
  <UApp>
    <main class="inspector">
      <header class="inspector-header">
        <h1>rstore</h1>
        <TargetSelector />
        <ConnectionState />
        <button @click="showConnection = !showConnection">
          Connection
        </button>
      </header>
      <form v-if="showConnection" class="connection-form" @submit.prevent="connect">
        <label>Relay URL<input v-model="baseURL" type="url" placeholder="http://localhost:5173/__rstore/" required></label>
        <label>Auth token<input v-model="authToken" type="password" autocomplete="off"></label>
        <button type="submit" :disabled="state.status === 'connecting'">
          Connect
        </button>
        <p v-if="connectionError" role="alert">
          {{ connectionError }}
        </p>
      </form>
      <nav class="tabs" aria-label="Inspector views">
        <button
          v-for="view in views" :key="view" :aria-current="state.view === view ? 'page' : undefined"
          @click="state.show(view)"
        >
          {{ view[0]!.toUpperCase() + view.slice(1) }}
        </button>
        <button class="refresh" :disabled="state.loading || !state.selection.target" @click="state.refresh()">
          {{ state.loading ? 'Loading' : 'Refresh' }}
        </button>
      </nav>
      <div class="inspector-content" :aria-busy="state.loading">
        <SessionRequest />
        <ReadViews />
        <ActionResult />
      </div>
      <ItemActionDialog />
    </main>
  </UApp>
</template>
