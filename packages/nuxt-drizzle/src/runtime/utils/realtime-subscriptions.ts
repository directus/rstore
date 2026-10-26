import type { EndSubscription } from '@rstore/shared'
import type { SubscriptionMessage } from './realtime'
import { getSubscriptionId } from './realtime'

/** Subscription target `(collection, key, where)` without its action. */
export type RealtimeTopic = Omit<SubscriptionMessage, 'action'>

/** One rstore subscription sharing a wire topic. */
interface LocalSubscriber {
  /** rstore lease identity, retained until unsubscribe. */
  id: string
  /** Optional live-query termination callback. */
  end?: EndSubscription
}

/** Client-side ref-counted registry of realtime subscriptions. */
export interface RealtimeSubscriptions {
  /** Count one local subscriber; sends `subscribe` for the first one. */
  subscribe: (topic: RealtimeTopic, subscriber?: LocalSubscriber) => void
  /** Release one local subscriber; sends `unsubscribe` after the last one. */
  unsubscribe: (topic: RealtimeTopic, id?: string) => void
  /** Notify live subscribers; stop replay when no plain subscriber remains. */
  reject: (topic: RealtimeTopic, reason?: string) => void
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
  const subscribers = new Map<string, LocalSubscriber & { topic: string }>()

  /** Count one local subscriber of `topic`. */
  function subscribe(topic: RealtimeTopic, subscriber?: LocalSubscriber) {
    const message: SubscriptionMessage = { action: 'subscribe', ...topic }
    const subscriptionId = getSubscriptionId(message)
    const count = countPerTopic.get(subscriptionId) ?? 0
    if (subscriber)
      subscribers.set(subscriber.id, { ...subscriber, topic: subscriptionId })
    if (count === 0 || !active.has(subscriptionId)) {
      send(message)
      active.set(subscriptionId, message)
    }
    countPerTopic.set(subscriptionId, count + 1)
  }

  /** Release one local subscriber of `topic`. */
  function unsubscribe(topic: RealtimeTopic, id?: string) {
    if (id)
      subscribers.delete(id)
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

  /** Notify a snapshot: callbacks may synchronously release local subscribers. */
  function reject(topic: RealtimeTopic, reason?: string): void {
    const subscriptionId = getSubscriptionId({ action: 'subscribe', ...topic })
    const matching = [...subscribers.values()].filter(subscriber => subscriber.topic === subscriptionId && subscriber.end)
    // Plain subscribe() keeps its existing connector-managed reconnect policy.
    if (matching.length === countPerTopic.get(subscriptionId))
      active.delete(subscriptionId)
    for (const subscriber of matching)
      subscriber.end!({ reason, retry: reason === 'authorize-error' })
  }

  return { subscribe, unsubscribe, reject, active }
}
