import type { PeerState } from './peerState'

/** Queue an update frame for delivery on the next microtask. */
export function enqueueUpdate(peer: any, state: PeerState, payload: any) {
  state.pendingUpdates.push(payload)
  if (state.flushScheduled) {
    return
  }
  state.flushScheduled = true
  queueMicrotask(() => {
    state.flushScheduled = false
    const pending = state.pendingUpdates
    if (pending.length === 0) {
      return
    }
    state.pendingUpdates = []
    try {
      if (pending.length === 1) {
        peer.send({ update: pending[0] })
      }
      else {
        peer.send({ updates: pending })
      }
    }
    catch (error) {
      console.error('[ws] failed to flush batched updates', error)
    }
  })
}
