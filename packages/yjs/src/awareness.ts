import type { Awareness } from 'y-protocols/awareness'

export interface AwarenessUser {
  /** Display name */
  name?: string
  /** Hex color (e.g. '#ff0000') */
  color?: string
  /** Any additional user-defined fields */
  [key: string]: any
}

export interface AwarenessState {
  user?: AwarenessUser
  /** Current cursor / selection info, application-defined */
  cursor?: Record<string, any>
  /** Any additional application-defined state */
  [key: string]: any
}

/**
 * Helper to manage Yjs Awareness state for user presence in collaborative
 * editing scenarios.
 *
 * This wraps `y-protocols/awareness` and provides a simpler API for setting
 * and reading user presence information.
 *
 * @example
 * ```ts
 * import { WebsocketProvider } from 'y-websocket'
 * import { createAwarenessHelper } from '@rstore/yjs'
 *
 * const provider = new WebsocketProvider('ws://localhost:1234', 'room', ydoc)
 * const awareness = createAwarenessHelper(provider.awareness)
 *
 * awareness.setUser({ name: 'Alice', color: '#ff0000' })
 * awareness.setCursor({ collection: 'posts', key: '1', field: 'title' })
 *
 * const peers = awareness.getStates() // all connected users
 * ```
 */
export function createAwarenessHelper(awareness: Awareness) {
  return {
    /**
     * Set the local user information broadcast to other peers.
     */
    setUser(user: AwarenessUser) {
      const current = awareness.getLocalState() ?? {}
      awareness.setLocalState({ ...current, user })
    },

    /**
     * Set cursor / selection state broadcast to other peers.
     */
    setCursor(cursor: Record<string, any> | null) {
      const current = awareness.getLocalState() ?? {}
      awareness.setLocalState({ ...current, cursor })
    },

    /**
     * Set arbitrary local awareness state fields.
     */
    setLocalState(state: Partial<AwarenessState>) {
      const current = awareness.getLocalState() ?? {}
      awareness.setLocalState({ ...current, ...state })
    },

    /**
     * Get all awareness states (including local).
     * Returns a Map of clientID → state.
     */
    getStates(): Map<number, AwarenessState> {
      return awareness.getStates() as Map<number, AwarenessState>
    },

    /**
     * Get the local client's awareness state.
     */
    getLocalState(): AwarenessState | null {
      return awareness.getLocalState() as AwarenessState | null
    },

    /**
     * Get the local client ID.
     */
    get clientID(): number {
      return awareness.clientID
    },

    /**
     * Subscribe to awareness changes.
     * @returns Unsubscribe function.
     */
    onChange(callback: (changes: { added: number[], updated: number[], removed: number[] }) => void): () => void {
      const handler = (changes: { added: number[], updated: number[], removed: number[] }) => {
        callback(changes)
      }
      awareness.on('change', handler)
      return () => {
        awareness.off('change', handler)
      }
    },

    /**
     * The underlying Awareness instance.
     */
    raw: awareness,
  }
}

export type AwarenessHelper = ReturnType<typeof createAwarenessHelper>
