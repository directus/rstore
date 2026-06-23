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
      pendingUpdates: [],
      flushScheduled: false,
    }
    peerStates.set(peer.id, state)
  }
  return state
}

/** Close every tracked peer during Nitro shutdown. */
export function closeAllRstoreDrizzlePeers() {
  for (const state of peerStates.values()) {
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
  peerStates.clear()
}
