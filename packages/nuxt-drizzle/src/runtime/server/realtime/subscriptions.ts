import type { SubscriptionMessage } from '../../utils/realtime'
import type { PeerState } from './utils/peerState'
// @ts-expect-error virtual file
import { dialect } from '$rstore-drizzle-server-utils.js'
import { getSubscriptionId } from '../../utils/realtime'
import { subscriptionMatches } from '../../utils/subscription-match'
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
    if (await isFilteredOut(peer, payload)) {
      return
    }
    enqueueUpdate(peer, state, payload)
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

async function isFilteredOut(peer: any, payload: any) {
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
  return rejected
}
