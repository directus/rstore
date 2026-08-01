import type { Plugin } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { realtimeReconnectEventHook } from '../src/events'
import { createStore } from '../src/store'

interface SubscriptionCall {
  type: 'subscribe' | 'unsubscribe'
  subscriptionId: string
  key?: string | number
  findOptions?: any
  collection: string
}

/**
 * Plugin recording every subscribe/unsubscribe hook call.
 */
function createSubscriptionSpyPlugin(calls: SubscriptionCall[]): Plugin {
  return {
    name: 'subscription-spy',
    setup({ hook }) {
      for (const type of ['subscribe', 'unsubscribe'] as const) {
        hook(type, (payload) => {
          calls.push({
            type,
            subscriptionId: payload.subscriptionId,
            key: payload.key,
            findOptions: payload.findOptions,
            collection: payload.collection.name,
          })
        })
      }
    },
  }
}

/**
 * Create a store with a `messages` collection and a fetch counter.
 */
function createMessagesStore(calls: SubscriptionCall[], { isServer = false } = {}) {
  let fetchCount = 0
  const storePromise = createStore({
    schema: [
      {
        name: 'messages',
        hooks: {
          fetchFirst: (findOptions: any) => {
            fetchCount++
            return { id: findOptions?.key ?? 'foo', text: 'hello' }
          },
          fetchMany: () => {
            fetchCount++
            return [{ id: 'foo', text: 'hello' }]
          },
        },
      },
    ],
    plugins: [createSubscriptionSpyPlugin(calls)],
    isServer,
  })
  return { storePromise, getFetchCount: () => fetchCount }
}

describe('realtime subscription', () => {
  it('liveQuery resubscribes when reactive options change', async () => {
    const calls: SubscriptionCall[] = []
    const { storePromise } = createMessagesStore(calls)
    const store = await storePromise

    const keyRef = ref('foo')
    const scope = effectScope()
    let query: any
    scope.run(() => {
      query = store.messages.liveQuery((q: any) => q.first({ key: keyRef.value }))
    })
    await query

    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({
      type: 'subscribe',
      collection: 'messages',
      findOptions: { key: 'foo' },
    })

    keyRef.value = 'bar'
    await nextTick()

    // Old subscription torn down, new one created for the new key.
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(calls[1]).toMatchObject({
      type: 'unsubscribe',
      subscriptionId: calls[0]!.subscriptionId,
      findOptions: { key: 'foo' },
    })
    expect(calls[2]).toMatchObject({
      type: 'subscribe',
      findOptions: { key: 'bar' },
    })
    expect(calls[2]!.subscriptionId).not.toBe(calls[0]!.subscriptionId)

    scope.stop()
    await vi.waitFor(() => expect(calls).toHaveLength(4))
    expect(calls[3]).toMatchObject({
      type: 'unsubscribe',
      subscriptionId: calls[2]!.subscriptionId,
    })
  })

  it('subscribe() resubscribes when reactive options change', async () => {
    const calls: SubscriptionCall[] = []
    const { storePromise } = createMessagesStore(calls)
    const store = await storePromise

    const keyRef = ref('a')
    const scope = effectScope()
    let sub: any
    scope.run(() => {
      sub = store.messages.subscribe((s: any) => s(keyRef.value))
    })

    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ type: 'subscribe', key: 'a' })

    keyRef.value = 'b'
    await nextTick()

    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(calls[1]).toMatchObject({
      type: 'unsubscribe',
      key: 'a',
      subscriptionId: calls[0]!.subscriptionId,
    })
    expect(calls[2]).toMatchObject({ type: 'subscribe', key: 'b' })

    await sub.unsubscribe()
    expect(calls).toHaveLength(4)
    expect(calls[3]).toMatchObject({
      type: 'unsubscribe',
      key: 'b',
      subscriptionId: calls[2]!.subscriptionId,
    })

    // Already unsubscribed: scope dispose must not emit another unsubscribe.
    scope.stop()
    await nextTick()
    expect(calls).toHaveLength(4)
  })

  it('does not subscribe nor register reconnect listener on the server', async () => {
    const calls: SubscriptionCall[] = []
    const { storePromise, getFetchCount } = createMessagesStore(calls, { isServer: true })
    const store = await storePromise

    const scope = effectScope()
    let query: any
    scope.run(() => {
      query = store.messages.liveQuery((q: any) => q.many())
    })
    await query

    expect(calls).toHaveLength(0)

    const baseline = getFetchCount()
    await realtimeReconnectEventHook.trigger()
    // No reconnect listener on the server: the query must not refresh.
    expect(getFetchCount()).toBe(baseline)

    scope.stop()
  })

  it('removes the reconnect listener on scope dispose', async () => {
    const calls: SubscriptionCall[] = []
    const { storePromise, getFetchCount } = createMessagesStore(calls)
    const store = await storePromise

    const scope = effectScope()
    let query: any
    scope.run(() => {
      query = store.messages.liveQuery((q: any) => q.many())
    })
    await query

    const baseline = getFetchCount()
    await realtimeReconnectEventHook.trigger()
    expect(getFetchCount()).toBe(baseline + 1)

    scope.stop()
    await realtimeReconnectEventHook.trigger()
    expect(getFetchCount()).toBe(baseline + 1)
  })
})
