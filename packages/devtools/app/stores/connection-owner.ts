import type { InspectorTransport } from '../transport/types'
import type { Inspector } from './connection'
import { onUnmounted } from 'vue'

/** Shared Inspector claims fence overlapping mounted components as well as retries. */
const claims = new WeakMap<Inspector, symbol>()

/** Component-owned acquisition boundary for embedded and external connections. */
export function useConnectionOwner(state: Inspector) {
  let active = true
  let attempt = 0
  let claim: symbol | undefined
  let owned: InspectorTransport | null = null
  onUnmounted(() => {
    active = false
    attempt++
    // Another component can already own the shared Inspector during teardown.
    if (claims.get(state) === claim && state.transport === owned) {
      claims.delete(state)
      state.disconnect()
    }
  })
  return {
    /** Capture ownership of an asynchronous discovery continuation. */
    capture() {
      const epoch = attempt
      const captured = claims.get(state)
      return () => active && epoch === attempt && claims.get(state) === captured
    },
    /** Acquire and publish one transport belonging to this component. */
    async connect(acquire: () => Promise<InspectorTransport>): Promise<boolean> {
      if (!active)
        return false
      const epoch = ++attempt
      const acquired = Symbol('inspector-connection')
      claim = acquired
      claims.set(state, acquired)
      const current = () => active && epoch === attempt && claims.get(state) === acquired
      state.disconnect()
      owned = null
      state.status = 'connecting'
      state.error = ''
      try {
        const transport = await acquire()
        if (!current()) {
          transport.dispose()
          return false
        }
        owned = transport
        await state.connect(transport)
        return current() && state.transport === transport
      }
      catch (error) {
        if (!current())
          return false
        state.status = 'disconnected'
        throw error
      }
    },
  }
}
