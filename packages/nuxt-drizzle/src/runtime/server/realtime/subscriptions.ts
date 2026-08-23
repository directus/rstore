import type { SubscriptionMessage } from '../../utils/realtime'
import type { PeerState } from './utils/peerState'
// @ts-expect-error virtual file
import { dialect } from '$rstore-drizzle-server-utils.js'
import { getSubscriptionId } from '../../utils/realtime'
import { subscriptionMatches } from '../../utils/subscription-match'
import { isCollectionAllowed } from '../utils/allow-list'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { getPubSub } from '../utils/pubsub'
import { enqueueUpdate } from './utils/outbound'

/** Handle a subscribe or unsubscribe frame. */
export async function handleSubscription(peer: any, state: PeerState, subscription: SubscriptionMessage) {
  const subscriptionId = getSubscriptionId(subscription)
  if (subscription.action === 'subscribe') {
    await subscribePeer(peer, state, subscriptionId, subscription)
  }
  else if (subscription.action === 'unsubscribe') {
    unsubscribePeer(state, subscriptionId)
  }
}

async function subscribePeer(peer: any, state: PeerState, subscriptionId: string, subscription: SubscriptionMessage) {
  if (state.subscriptions.has(subscriptionId)) {
    return
  }
  // `allowTables` allow-list applies to realtime too: a subscription to a
  // non-allowed collection is rejected before the authorize hook runs, so
  // denied tables are never streamed even when no authorize hook exists.
  if (!isCollectionAllowed(subscription.collection)) {
    sendRejectedSubscription(peer, subscription, 'collection-not-allowed')
    return
  }
  const rejectedReason = await authorizeSubscription(peer, subscription)
  if (rejectedReason) {
    sendRejectedSubscription(peer, subscription, rejectedReason)
    return
  }

  state.subscriptions.set(subscriptionId, subscription)
  if (!state.off) {
    state.off = getPubSub().subscribe('update', payload => fanOutUpdate(peer, state, payload))
  }
}

function unsubscribePeer(state: PeerState, subscriptionId: string) {
  state.subscriptions.delete(subscriptionId)
  if (state.subscriptions.size === 0 && state.off) {
    state.off()
    state.off = undefined
  }
}

async function authorizeSubscription(peer: any, subscription: SubscriptionMessage) {
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
  return rejected ? rejectedReason : undefined
}

function sendRejectedSubscription(peer: any, subscription: SubscriptionMessage, reason: string | undefined) {
  try {
    peer.send({
      subscription: {
        action: 'rejected',
        collection: subscription.collection,
        key: subscription.key,
        where: subscription.where,
        reason,
      },
    })
  }
  catch (error) {
    console.error('[ws] failed to send rejection frame', error)
  }
}

async function fanOutUpdate(peer: any, state: PeerState, payload: any) {
  try {
    if (payload.originClientId && state.clientId && payload.originClientId === state.clientId) {
      return
    }
    if (!matchesAnySubscription(state, payload)) {
      return
    }
    // Narrowing deliberately runs after subscription matching: `where`
    // filters are evaluated against the full record (and `previousRecord`
    // for `updated` frames), and only the wire frame is narrowed.
    const { rejected, record } = await runFilterHooks(peer, payload)
    if (rejected) {
      return
    }
    enqueueUpdate(peer, state, buildPeerFrame(payload, record))
  }
  catch (error) {
    console.error('[ws] fan-out error for peer', peer.id, error)
  }
}

function matchesAnySubscription(state: PeerState, payload: any) {
  for (const sub of state.subscriptions.values()) {
    if (subscriptionMatches(sub, payload, dialect)) {
      return true
    }
  }
  return false
}

interface FilterOutcome {
  rejected: boolean
  /** `undefined` when no handler narrowed the frame for this peer. */
  record?: Record<string, any>
}

/**
 * Runs the `realtime.filter` handlers for one peer and collects their verdict.
 *
 * The narrowed record is accumulated in a local, never written back onto the
 * payload: every handler must authorize against the full published row, and
 * that row is the single object shared with every other peer.
 */
async function runFilterHooks(peer: any, payload: any): Promise<FilterOutcome> {
  let rejected = false
  let narrowed: Record<string, any> | undefined

  await rstoreDrizzleHooks.callHook('realtime.filter', {
    collection: payload.collection,
    record: payload.record,
    previousRecord: payload.previousRecord,
    fieldTimestamps: payload.fieldTimestamps,
    originClientId: payload.originClientId,
    key: payload.key,
    type: payload.type,
    peer,
    reject: () => {
      rejected = true
    },
    narrowRecord: (next: any) => {
      const base = narrowed ?? payload.record
      if (!next || typeof next !== 'object' || !base || typeof base !== 'object') {
        return
      }
      // Intersect rather than replace, so successive handlers compose to the
      // columns they all kept and the result does not depend on the order
      // their Nitro plugins happened to register in.
      narrowed = pickKeys(next, base)
    },
  })

  return { rejected, record: narrowed }
}

/**
 * Copies the entries of `source` whose key also exists in `allowed`.
 *
 * @param source Object supplying the values.
 * @param allowed Object supplying the permitted key set.
 */
function pickKeys(source: Record<string, any>, allowed: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const key of Object.keys(source)) {
    if (Object.prototype.hasOwnProperty.call(allowed, key)) {
      out[key] = source[key]
    }
  }
  return out
}

/**
 * Builds the object actually delivered to one peer.
 *
 * Returns `payload` untouched when nothing has to change, so the common case
 * still shares a single frame across every peer. `previousRecord` is
 * server-only and is stripped in the same copy. A narrowed record also narrows
 * `fieldTimestamps`: a stamp left behind for an omitted field would be newer
 * than the client's, and the per-field merge would resolve that field to
 * `undefined` — erasing the value the peer legitimately holds.
 *
 * @param payload Published frame, shared across peers.
 * @param narrowedRecord Per-peer record subset, or `undefined` when none.
 */
function buildPeerFrame(payload: any, narrowedRecord: Record<string, any> | undefined) {
  if (narrowedRecord === undefined && payload.previousRecord === undefined) {
    return payload
  }

  const { previousRecord: _previousRecord, ...frame } = payload
  if (narrowedRecord !== undefined) {
    frame.record = narrowedRecord
    if (frame.fieldTimestamps) {
      frame.fieldTimestamps = pickKeys(frame.fieldTimestamps, narrowedRecord)
    }
  }
  return frame
}
