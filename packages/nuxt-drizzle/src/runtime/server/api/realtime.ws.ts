import type { ClientInitMessage, SubscriptionMessage } from '../../utils/realtime'
// @ts-expect-error virtual file
import { dialect } from '$rstore-drizzle-server-utils.js'
import { defineWebSocketHandler } from 'h3'
import { getSubscriptionId, normalizeSubscriptionKey } from '../../utils/realtime'
import { subscriptionMatches } from '../../utils/subscription-match'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { getPubSub } from '../utils/pubsub'

/**
 * Per-peer state tracked by the realtime handler. One `pubsub.subscribe`
 * call covers every active subscription on the peer: incoming updates are
 * matched against the peer's subscription map in-memory, so N live queries
 * on a single peer cost O(N) matcher passes per update instead of N
 * separate pubsub listeners.
 */
interface PeerState {
  /** Client id used for skip-self echo suppression. Set via the `init` frame. */
  clientId?: string
  /** Active subscriptions, keyed by `getSubscriptionId(sub)`. */
  subscriptions: Map<string, SubscriptionMessage>
  /** Teardown for the single shared pubsub subscription (set on first subscribe). */
  off?: () => void
}

const peerStates: Map<string, PeerState> = new Map()

function getPeerState(peerId: string): PeerState {
  let state = peerStates.get(peerId)
  if (!state) {
    state = { subscriptions: new Map() }
    peerStates.set(peerId, state)
  }
  return state
}

export default defineWebSocketHandler({
  message(peer, message) {
    const text = message.text()
    if (text === 'ping') {
      peer.send('pong')
      return
    }

    let data: { subscription?: SubscriptionMessage, init?: ClientInitMessage }
    try {
      data = message.json() as typeof data
    }
    catch {
      return
    }

    const state = getPeerState(peer.id)

    // One-off client id handshake for skip-self echo suppression
    if (data.init && typeof data.init.clientId === 'string') {
      state.clientId = data.init.clientId
      return
    }

    if (!data.subscription) {
      return
    }

    // Normalize the key once on receipt so subsequent strict comparisons
    // against the publisher-emitted string key never silently miss.
    const subscription: SubscriptionMessage = {
      ...data.subscription,
      key: data.subscription.key != null ? normalizeSubscriptionKey(data.subscription.key) : undefined,
    }
    const subscriptionId = getSubscriptionId(subscription)

    if (subscription.action === 'subscribe') {
      if (state.subscriptions.has(subscriptionId)) {
        return
      }
      state.subscriptions.set(subscriptionId, subscription)

      // Attach the single per-peer pubsub listener lazily on first subscribe.
      if (!state.off) {
        state.off = getPubSub().subscribe('update', async (payload) => {
          // Skip echoing the update to the peer that triggered it.
          if (payload.originClientId && state.clientId && payload.originClientId === state.clientId) {
            return
          }

          // A single match is enough — the peer only needs one `update` frame
          // regardless of how many of its subscriptions happened to match.
          let matched = false
          for (const sub of state.subscriptions.values()) {
            if (subscriptionMatches(sub, payload, dialect)) {
              matched = true
              break
            }
          }
          if (!matched) {
            return
          }

          let rejected = false
          await rstoreDrizzleHooks.callHook('realtime.filter', {
            collection: payload.collection,
            record: payload.record,
            key: payload.key,
            type: payload.type,
            peer,
            reject: () => {
              rejected = true
            },
          })
          if (rejected) {
            return
          }

          peer.send({ update: payload })
        })
      }
    }
    else if (subscription.action === 'unsubscribe') {
      state.subscriptions.delete(subscriptionId)
      // Detach the pubsub listener when the peer has no active subscriptions.
      if (state.subscriptions.size === 0 && state.off) {
        state.off()
        state.off = undefined
      }
    }
  },

  close(peer) {
    const state = peerStates.get(peer.id)
    if (state?.off) {
      state.off()
    }
    peerStates.delete(peer.id)
  },

  error(peer, error) {
    console.error('[ws] error', peer, error)
  },
})
