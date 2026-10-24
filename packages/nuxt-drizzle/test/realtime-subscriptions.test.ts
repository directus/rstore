import type { SubscriptionMessage } from '../src/runtime/utils/realtime'
import { describe, expect, it } from 'vitest'
import { createRealtimeSubscriptions } from '../src/runtime/utils/realtime-subscriptions'

/** Registry whose wire frames are recorded in send order. */
function createRecordedSubscriptions() {
  const sent: SubscriptionMessage[] = []
  const subscriptions = createRealtimeSubscriptions(message => sent.push(message))
  return { sent, subscriptions }
}

describe('createRealtimeSubscriptions', () => {
  it('sends one subscribe per topic and unsubscribes after its last local subscriber', () => {
    const { sent, subscriptions } = createRecordedSubscriptions()
    const topic = { collection: 'todos', key: '1', where: undefined }

    subscriptions.subscribe(topic)
    subscriptions.subscribe(topic)
    subscriptions.unsubscribe(topic)
    expect([...subscriptions.active.values()]).toEqual([{ action: 'subscribe', ...topic }])
    subscriptions.unsubscribe(topic)

    expect(sent).toEqual([
      { action: 'subscribe', ...topic },
      { action: 'unsubscribe', ...topic },
    ])
    expect(subscriptions.active.size).toBe(0)
  })

  it('ignores an unsubscribe without a matching subscribe', () => {
    const { sent, subscriptions } = createRecordedSubscriptions()
    const topic = { collection: 'todos', key: undefined, where: undefined }

    subscriptions.unsubscribe(topic)
    subscriptions.subscribe(topic)

    expect(sent).toEqual([{ action: 'subscribe', ...topic }])
  })
})
