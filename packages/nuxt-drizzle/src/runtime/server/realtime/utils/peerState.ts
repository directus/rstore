import type { SubscriptionMessage } from '../../../utils/realtime'

/** Per-peer state tracked by the realtime handler. */
export interface PeerState {
  /** Reference to the peer itself for shutdown cleanup. */
  peer: any
  /** Client id used for skip-self echo suppression. */
  clientId?: string
  /** Whether the init ack has already been sent. */
  initAckSent: boolean
  /** Whether the peer has been rejected and should be ignored. */
  rejected: boolean
  /** Active subscriptions keyed by subscription id. */
  subscriptions: Map<string, SubscriptionMessage>
  /**
   * Token of the subscribe attempt still awaiting `realtime.authorize`, keyed
   * by subscription id. An unsubscribe deletes it so the attempt is dropped.
   */
  pendingSubscriptions: Map<string, symbol>
  /** Teardown for the shared pubsub subscription. */
  off?: () => void
  /** Pending outbound updates. */
  pendingUpdates: any[]
  /** Whether a pending update flush is scheduled. */
  flushScheduled: boolean
}

/** Peer states keyed by h3 peer id. */
export const peerStates: Map<string, PeerState> = new Map()

/** Return existing peer state or create a fresh one. */
export function getPeerState(peer: any): PeerState {
  let state = peerStates.get(peer.id)
  if (!state) {
    state = {
      peer,
      initAckSent: false,
      rejected: false,
      subscriptions: new Map(),
      pendingSubscriptions: new Map(),
      pendingUpdates: [],
      flushScheduled: false,
    }
    peerStates.set(peer.id, state)
  }
  return state
}

/**
 * Detach a peer for good: drop its pending authorization tokens so those
 * attempts bail, drop its pubsub listener and stop tracking it.
 *
 * @param state State of the peer being closed.
 */
export function disposePeerState(state: PeerState) {
  state.pendingSubscriptions.clear()
  state.off?.()
  state.off = undefined
  if (peerStates.get(state.peer?.id) === state) {
    peerStates.delete(state.peer.id)
  }
}

/** Close every tracked peer during Nitro shutdown. */
export function closeAllRstoreDrizzlePeers() {
  for (const state of [...peerStates.values()]) {
    // The crossws `close` hook may run after this loop (or never, for a
    // terminated socket), so release the listener here rather than rely on it.
    disposePeerState(state)
    const peer = state.peer
    try {
      if (typeof peer?.terminate === 'function') {
        peer.terminate()
      }
      else {
        peer?.close?.(1001, 'server-shutdown')
      }
    }
    catch (error) {
      console.error('[ws] failed to close peer on shutdown', error)
    }
  }
}
