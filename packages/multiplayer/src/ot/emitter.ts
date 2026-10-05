/** Minimal synchronous typed event emitter for the collab client. */
export function createEmitter<TEvents extends Record<string, unknown>>() {
  const listeners = new Map<keyof TEvents, Set<(payload: any) => void>>()
  return {
    /** Subscribes to an event; returns the unsubscribe function. */
    on<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void): () => void {
      let set = listeners.get(event)
      if (!set) {
        listeners.set(event, set = new Set())
      }
      set.add(listener)
      return () => set.delete(listener)
    },
    /** Calls the listeners of an event in subscription order. */
    emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
      for (const listener of listeners.get(event) ?? []) {
        listener(payload)
      }
    },
  }
}
