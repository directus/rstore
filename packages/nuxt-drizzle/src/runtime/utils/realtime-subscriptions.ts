import type { SubscriptionMessage } from './realtime'
import { getSubscriptionId } from './realtime'

/** Subscription target `(collection, key, where)` without its action. */
export type RealtimeTopic = Omit<SubscriptionMessage, 'action'>

/** Client-side ref-counted registry of realtime subscriptions. */
export interface RealtimeSubscriptions {
  /** Count one local subscriber; sends `subscribe` for the first one. */
  subscribe: (topic: RealtimeTopic) => void
  /** Release one local subscriber; sends `unsubscribe` after the last one. */
  unsubscribe: (topic: RealtimeTopic) => void
  /** Subscribe frames of topics with local subscribers, keyed by subscription id. */
  active: ReadonlyMap<string, SubscriptionMessage>
}

/**
 * Creates a {@link RealtimeSubscriptions} registry. A given
 * `(collection, key, where)` is only sent to the server once, regardless of
 * how many components subscribe to it locally. The matching `unsubscribe` is
 * only emitted when the last subscriber is torn down.
 *
 * @param send Writes one subscription frame to the socket.
 */
export function createRealtimeSubscriptions(send: (message: SubscriptionMessage) => void): RealtimeSubscriptions {
  const countPerTopic = new Map<string, number>()
  const active = new Map<string, SubscriptionMessage>()

  /** Count one local subscriber of `topic`. */
  function subscribe(topic: RealtimeTopic) {
    const message: SubscriptionMessage = { action: 'subscribe', ...topic }
    const subscriptionId = getSubscriptionId(message)
    const count = countPerTopic.get(subscriptionId) ?? 0
    if (count === 0) {
      send(message)
      active.set(subscriptionId, message)
    }
    countPerTopic.set(subscriptionId, count + 1)
  }

  /** Release one local subscriber of `topic`. */
  function unsubscribe(topic: RealtimeTopic) {
    const message: SubscriptionMessage = { action: 'unsubscribe', ...topic }
    const subscriptionId = getSubscriptionId(message)
    const current = countPerTopic.get(subscriptionId) ?? 0
    // Guard against decrementing below zero — a stray unsubscribe without
    // a matching subscribe would otherwise send a spurious unsubscribe
    // frame and corrupt the counter.
    if (current <= 0) {
      return
    }
    if (current > 1) {
      countPerTopic.set(subscriptionId, current - 1)
    }
    else {
      send(message)
      active.delete(subscriptionId)
      // Ids embed `where`, so they are unbounded over an app's lifetime:
      // drop the key instead of keeping a zero entry per past topic.
      countPerTopic.delete(subscriptionId)
    }
  }

  return { subscribe, unsubscribe, active }
}
