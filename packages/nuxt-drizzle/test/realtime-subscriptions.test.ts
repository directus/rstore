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
  it('reports rejection to every matching live subscriber and stops reconnect replay', () => {
    const { sent, subscriptions } = createRecordedSubscriptions()
    const ended: unknown[] = []
    const topic = { collection: 'todos', key: '1' }
    subscriptions.subscribe(topic, { id: 'first', end: options => ended.push(['first', options]) })
    subscriptions.subscribe(topic, { id: 'second', end: options => ended.push(['second', options]) })
    subscriptions.subscribe({ collection: 'todos', key: '2' }, { id: 'other', end: options => ended.push(['other', options]) })

    subscriptions.reject(topic, 'forbidden')
    expect(ended).toEqual([
      ['first', { reason: 'forbidden', retry: false }],
      ['second', { reason: 'forbidden', retry: false }],
    ])
    expect([...subscriptions.active.values()]).toEqual([{ action: 'subscribe', collection: 'todos', key: '2' }])
    subscriptions.unsubscribe(topic, 'first')
    subscriptions.unsubscribe(topic, 'second')
    // Fresh permission check must open a new wire subscription after rejection.
    subscriptions.subscribe(topic, { id: 'fresh', end: options => ended.push(['fresh', options]) })
    expect(sent.at(-1)).toEqual({ action: 'subscribe', ...topic })
    subscriptions.reject(topic, 'still forbidden')
    expect(ended.at(-1)).toEqual(['fresh', { reason: 'still forbidden', retry: false }])
    expect(ended).toHaveLength(3)
  })

  it('retries transient authorization errors while preserving unrelated topics', () => {
    const { sent, subscriptions } = createRecordedSubscriptions()
    const ends: unknown[] = []
    const topic = { collection: 'todos', key: '1' }
    subscriptions.subscribe(topic, { id: 'retry', end: options => ends.push(options) })
    subscriptions.subscribe({ collection: 'todos', key: '2' }, { id: 'other', end: options => ends.push(['other', options]) })
    subscriptions.reject(topic, 'authorize-error')
    expect(ends).toEqual([{ reason: 'authorize-error', retry: true }])
    expect([...subscriptions.active.values()]).toEqual([{ action: 'subscribe', collection: 'todos', key: '2' }])
    subscriptions.unsubscribe(topic, 'retry')
    subscriptions.subscribe(topic, { id: 'reopened', end: options => ends.push(options) })
    expect(sent.at(-1)).toEqual({ action: 'subscribe', ...topic })
  })

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

  it('retains plain subscriber reconnect behavior when a shared live query ends', () => {
    const { subscriptions } = createRecordedSubscriptions()
    const topic = { collection: 'todos', key: '1' }
    const ended: unknown[] = []
    subscriptions.subscribe(topic, { id: 'plain' })
    subscriptions.subscribe(topic, { id: 'live', end: options => ended.push(options) })
    subscriptions.reject(topic, 'denied')
    subscriptions.unsubscribe(topic, 'live')
    expect(ended).toEqual([{ reason: 'denied', retry: false }])
    expect([...subscriptions.active.values()]).toEqual([{ action: 'subscribe', ...topic }])
    subscriptions.unsubscribe(topic, 'plain')
    expect(subscriptions.active.size).toBe(0)
  })
})
