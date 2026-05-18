import type { ClientInitMessage, SubscriptionMessage } from '../../utils/realtime'
// @ts-expect-error virtual file
import { dialect } from '$rstore-drizzle-server-utils.js'
import { defineWebSocketHandler } from 'h3'
import {
  getSubscriptionId,
  normalizeSubscriptionKey,
  RSTORE_DRIZZLE_PROTOCOL_MAX_VERSION,
  RSTORE_DRIZZLE_PROTOCOL_MIN_VERSION,
  RSTORE_DRIZZLE_PROTOCOL_VERSION,
} from '../../utils/realtime'
import { subscriptionMatches } from '../../utils/subscription-match'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { getPubSub } from '../utils/pubsub'

/**
 * Header the client sends on the HTTP upgrade so the server can bind
 * the peer's `clientId` for skip-self echo suppression without waiting
 * for the explicit `init` frame.
 */
const CLIENT_ID_HEADER = 'x-rstore-client-id'

/**
 * Per-peer state tracked by the realtime handler. One `pubsub.subscribe`
 * call covers every active subscription on the peer: incoming updates are
 * matched against the peer's subscription map in-memory, so N live queries
 * on a single peer cost O(N) matcher passes per update instead of N
 * separate pubsub listeners.
 */
interface PeerState {
  /**
   * Reference to the peer itself. Stored so the shutdown hook can iterate
   * over `peerStates` and force-close every live socket — without this,
   * the Nitro dev worker hangs on restart because Node's HTTP `listener.close()`
   * waits for upgraded WebSocket connections that `closeAllConnections()`
   * intentionally leaves open.
   */
  peer: any
  /** Client id used for skip-self echo suppression. Set via the `init` frame. */
  clientId?: string
  /** Whether the init ack has already been sent to this peer. */
  initAckSent: boolean
  /**
   * Set once the peer has been rejected (e.g. unsupported protocol). All
   * subsequent frames from this peer are ignored — the rejection frame
   * has already been sent and the peer should be closing.
   */
  rejected: boolean
  /** Active subscriptions, keyed by `getSubscriptionId(sub)`. */
  subscriptions: Map<string, SubscriptionMessage>
  /** Teardown for the single shared pubsub subscription (set on first subscribe). */
  off?: () => void
  /** Pending outbound update frames, flushed as a batch at end of microtask. */
  pendingUpdates: any[]
  /** Tracks whether a microtask-flush is already scheduled for this peer. */
  flushScheduled: boolean
}

const peerStates: Map<string, PeerState> = new Map()

function getPeerState(peer: any): PeerState {
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

/**
 * Close every tracked peer. Called from the Nitro `close` hook so the
 * worker thread can finish shutting down — Node's `server.closeAllConnections()`
 * deliberately skips upgraded sockets, which means an open WebSocket keeps
 * `listener.close()` pending and blocks dev-server restarts.
 *
 * Prefers `terminate()` (forced socket destroy) over `close()` (graceful
 * close handshake) because the close handshake races against client
 * auto-reconnect: a polite close frame the browser ACKs after the new
 * connection is already in flight defeats the point of shutting down.
 *
 * Best-effort: per-peer failures are logged and do not abort the loop, so a
 * single misbehaving peer cannot deadlock the shutdown sequence.
 */
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

/**
 * Decide whether a peer-announced version is one the server can speak.
 * Missing `v` means a legacy v1 client and is allowed; anything outside
 * the supported window triggers an init rejection.
 */
function isSupportedClientVersion(v: unknown): boolean {
  if (v == null) {
    return true
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return false
  }
  return v >= RSTORE_DRIZZLE_PROTOCOL_MIN_VERSION && v <= RSTORE_DRIZZLE_PROTOCOL_MAX_VERSION
}

/**
 * Send an init failure frame and close the socket. Mark the peer state
 * `rejected` so any frames the client manages to send before the close
 * lands are dropped without side effects.
 */
function rejectPeerVersion(peer: any, state: PeerState, error: string) {
  state.rejected = true
  try {
    peer.send({ init: { ok: false, error, v: RSTORE_DRIZZLE_PROTOCOL_VERSION } })
  }
  catch (sendErr) {
    console.error('[ws] failed to send init rejection', sendErr)
  }
  try {
    peer.close?.(1002, error)
  }
  catch (closeErr) {
    console.error('[ws] failed to close after init rejection', closeErr)
  }
}

function sendInitAck(peer: any, state: PeerState) {
  if (state.initAckSent) {
    return
  }
  state.initAckSent = true
  try {
    peer.send({ init: { ok: true, v: RSTORE_DRIZZLE_PROTOCOL_VERSION } })
  }
  catch (error) {
    console.error('[ws] failed to send init ack', error)
  }
}

/**
 * Queue an update frame for delivery on the next microtask. Back-to-back
 * publishes in the same tick coalesce into a single `{ updates: [...] }`
 * frame to cut wire overhead. A single queued item still flushes as the
 * legacy `{ update }` shape so v1 clients keep working.
 */
function enqueueUpdate(peer: any, state: PeerState, payload: any) {
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

export default defineWebSocketHandler({
  upgrade(request) {
    // Belt-and-suspenders fallback for the explicit `init` frame: if the
    // client tagged the HTTP upgrade with its clientId, stash it on the
    // peer context so the subsequent `open` hook can bind it immediately.
    const clientId = request.headers.get(CLIENT_ID_HEADER)
    if (clientId) {
      (request.context as Record<string, unknown>).rstoreClientId = clientId
    }
  },

  open(peer) {
    const state = getPeerState(peer)
    const preBound = (peer.context as Record<string, unknown> | undefined)?.rstoreClientId
    if (typeof preBound === 'string' && !state.clientId) {
      state.clientId = preBound
      // When the transport already supplied the client id during upgrade,
      // the peer is ready immediately and can be ack'd from `open()`.
      sendInitAck(peer, state)
    }
  },

  async message(peer, message) {
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

    const state = getPeerState(peer)

    // Drop everything once the peer has been rejected — the close frame
    // is in flight but the client may still ship buffered data.
    if (state.rejected) {
      return
    }

    // One-off client id handshake for skip-self echo suppression
    if (data.init && typeof data.init.clientId === 'string') {
      // Verify protocol compatibility before accepting any subscription
      // frames. A v999 client connecting to a v2 server would otherwise
      // see legacy frame shapes for new features and silently desync.
      if (!isSupportedClientVersion(data.init.v)) {
        rejectPeerVersion(peer, state, 'unsupported-version')
        return
      }
      state.clientId = data.init.clientId
      // Ack only after the server has actually registered the client id.
      sendInitAck(peer, state)
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

      // `realtime.authorize` may veto the subscription — for example to
      // enforce row-level ACLs. Wrapped in try/catch so a throwing hook
      // does not crash the peer's message loop.
      let rejectedReason: string | undefined
      let rejected = false
      try {
        await rstoreDrizzleHooks.callHook('realtime.authorize', {
          peer,
          collection: subscription.collection,
          subscription,
          meta: {},
          reject: (reason) => {
            rejected = true
            rejectedReason = reason
          },
        })
      }
      catch (error) {
        console.error('[ws] realtime.authorize error', error)
        rejected = true
        rejectedReason = 'authorize-error'
      }
      if (rejected) {
        try {
          peer.send({
            subscription: {
              action: 'rejected',
              collection: subscription.collection,
              key: subscription.key,
              where: subscription.where,
              reason: rejectedReason,
            },
          })
        }
        catch (error) {
          console.error('[ws] failed to send rejection frame', error)
        }
        return
      }

      state.subscriptions.set(subscriptionId, subscription)

      // Attach the single per-peer pubsub listener lazily on first subscribe.
      if (!state.off) {
        state.off = getPubSub().subscribe('update', async (payload) => {
          // A single pubsub listener handles every active subscription on
          // this peer. We trap here so a throw from `realtime.filter` or
          // `peer.send` on one peer cannot crash the fan-out worker and
          // starve every other subscriber listening on the same pubsub.
          try {
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

            enqueueUpdate(peer, state, payload)
          }
          catch (error) {
            console.error('[ws] fan-out error for peer', peer.id, error)
          }
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
