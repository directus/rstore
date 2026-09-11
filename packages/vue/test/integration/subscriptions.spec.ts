import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { realtimeReconnectEventHook } from '../../src'

// Asserting which subscribe/unsubscribe hooks fire cannot show the state the
// store ends up in: whether a frame actually reaches a collection-wide
// subscription, whether a resubscribe leaves an orphan alive on the server, and
// whether the queue survives a failed subscribe. Those are the regressions this
// file guards, against `remote.subscriptions()` — the set of subscriptions the
// backend still holds.

const schema: StoreSchema = [{ name: 'todos' }]

/**
 * Store backed by a scripted fake remote.
 *
 * @param options Extra `createStore` options, e.g. `isServer`.
 */
function setup(options: Record<string, any> = {}) {
  return createVueStack({
    schema,
    data: {
      todos: [
        { id: '1', title: 'One', done: false },
        { id: '2', title: 'Two', done: false },
      ],
    },
    ...options,
  })
}

/** The subscribe/unsubscribe hooks the remote saw, in order. */
function subscriptionCalls(remote: any) {
  return remote.calls
    .filter((call: any) => call.hook === 'subscribe' || call.hook === 'unsubscribe')
    .map((call: any) => call.hook)
}

describe('realtime subscriptions', () => {
  it('subscribes to the whole collection with no options and receives frames for any key', async () => {
    const { store, run, remote, scope } = await setup()
    const list = await run(() => store.todos.query((q: any) => q.many()))

    scope(() => store.todos.subscribe())
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
    expect(remote.lastRequest('subscribe')).toMatchObject({ key: undefined, findOptions: undefined })

    // No key was given, so any key of the collection must be delivered.
    remote.emit({ type: 'created', collection: 'todos', item: { id: '5', title: 'Five' } })
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Renamed' } })
    await nextTick()

    expect(list.data.value.map((todo: any) => todo.id)).toContain('5')
    expect(list.data.value.find((todo: any) => todo.id === '1').title).toBe('Renamed')
  })

  it('does not double-subscribe when a keyed live query is open on the same collection', async () => {
    const { store, run, remote, scope } = await setup()
    scope(() => store.todos.subscribe())
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))

    const live = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(2))

    // One subscription each, and the collection-wide one is not torn down and
    // re-opened because a keyed query joined.
    expect(remote.callCount('subscribe')).toBe(2)
    expect(remote.callCount('unsubscribe')).toBe(0)

    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Renamed' } })
    await nextTick()
    expect(live.data.value.title).toBe('Renamed')
  })

  it('replaces the subscription when a reactive filter changes, leaving no orphan', async () => {
    const { store, remote, scope } = await setup()
    const where = ref<any>({ done: false })
    const { result } = scope(() => store.todos.liveQuery((q: any) => q.many({ params: { where: where.value } })))
    await result
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
    const first = remote.subscriptions()[0]

    where.value = { done: true }
    await nextTick()
    await vi.waitFor(() => expect(remote.callCount('subscribe')).toBe(2))

    // Old subscription closed before the new one opened, and only the new one
    // is left alive on the backend.
    expect(subscriptionCalls(remote)).toEqual(['subscribe', 'unsubscribe', 'subscribe'])
    expect(remote.subscriptions()).toHaveLength(1)
    expect(remote.subscriptions()[0]).not.toBe(first)
    expect(remote.lastRequest('subscribe')!.findOptions.params.where).toEqual({ done: true })
  })

  it('replaces a keyed subscribe() when its key changes, and closes for good on unsubscribe', async () => {
    const { store, remote, scope } = await setup()
    const key = ref('1')
    const { result: sub, stop } = scope(() => store.todos.subscribe((s: any) => s(key.value)))

    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
    expect(remote.lastRequest('subscribe')).toMatchObject({ key: '1', findOptions: undefined })
    const firstId = remote.lastRequest('subscribe')!.subscriptionId

    key.value = '2'
    await nextTick()
    await vi.waitFor(() => expect(remote.callCount('subscribe')).toBe(2))

    // The subscription the old key opened is closed, not left behind.
    expect(subscriptionCalls(remote)).toEqual(['subscribe', 'unsubscribe', 'subscribe'])
    expect(remote.lastRequest('unsubscribe')).toMatchObject({ key: '1', subscriptionId: firstId })
    expect(remote.lastRequest('subscribe')).toMatchObject({ key: '2' })
    expect(remote.subscriptions()).toHaveLength(1)

    await sub.unsubscribe()
    expect(remote.subscriptions()).toHaveLength(0)

    // Already unsubscribed: disposing the scope must not close it a second time.
    stop()
    await nextTick()
    expect(remote.callCount('unsubscribe')).toBe(2)
  })

  it('settles rapid option flips into a single subscription, even after a failed subscribe', async () => {
    const { store, remote, scope } = await setup()
    const where = ref<any>({ done: false })
    const { result } = scope(() => store.todos.liveQuery((q: any) => q.many({ params: { where: where.value } })))
    await result
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))

    // The transport rejects one subscribe in the middle of the burst: the
    // serialized queue must keep draining instead of wedging.
    remote.failNext('subscribe')
    where.value = { done: true }
    await nextTick()
    where.value = { title: 'One' }
    await nextTick()
    where.value = { title: 'Two' }
    await nextTick()

    await vi.waitFor(() => {
      expect(remote.subscriptions()).toHaveLength(1)
      expect(remote.lastRequest('subscribe')!.findOptions.params.where).toEqual({ title: 'Two' })
    })
  })

  it('refreshes every live query on reconnect and stops for the disposed one', async () => {
    const { store, remote, scope } = await setup()
    const first = scope(() => store.todos.liveQuery((q: any) => q.many()))
    const second = scope(() => store.todos.liveQuery((q: any) => q.first('1')))
    await first.result
    await second.result
    const many = remote.callCount('fetchMany')
    const one = remote.callCount('fetchFirst')

    await realtimeReconnectEventHook.trigger()
    expect(remote.callCount('fetchMany')).toBe(many + 1)
    expect(remote.callCount('fetchFirst')).toBe(one + 1)

    first.stop()
    await realtimeReconnectEventHook.trigger()

    // The disposed query's listener is detached; the live one still refetches.
    expect(remote.callCount('fetchMany')).toBe(many + 1)
    expect(remote.callCount('fetchFirst')).toBe(one + 2)
  })

  it('does not reconnect or resubscribe a disposed dynamic live query', async () => {
    const { store, remote, run, scope } = await createVueStack({
      schema: [{ name: 'todos' }, { name: 'archived' }],
      data: {
        todos: [{ id: '1', title: 'One', done: false }],
        archived: [{ id: '2', title: 'Archived', done: true }],
      },
    })
    const collectionName = ref('todos')
    const api = run(() => store.$collection(collectionName))
    const live = scope(() => api.liveQuery((q: any) => q.many()))
    await live.result
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))

    live.stop()
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(0))
    const fetches = remote.callCount('fetchMany')
    const subscribes = remote.callCount('subscribe')

    collectionName.value = 'archived'
    await nextTick()
    await realtimeReconnectEventHook.trigger()

    expect(remote.callCount('fetchMany')).toBe(fetches)
    expect(remote.callCount('subscribe')).toBe(subscribes)
  })

  it('opens no subscription and registers no reconnect listener on the server', async () => {
    const { store, run, remote } = await setup({ isServer: true })
    const list = await run(() => store.todos.liveQuery((q: any) => q.many()))
    expect(list.data.value).toHaveLength(2)

    expect(remote.subscriptions()).toHaveLength(0)
    expect(remote.callCount('subscribe')).toBe(0)

    // A server scope is never disposed, so a reconnect listener registered here
    // would keep every SSR request's query graph alive.
    const fetches = remote.callCount('fetchMany')
    await realtimeReconnectEventHook.trigger()
    expect(remote.callCount('fetchMany')).toBe(fetches)
  })

  it('unsubscribes on scope dispose while the first fetch is still in flight', async () => {
    const { store, remote, scope } = await setup()
    const release = remote.holdNext('fetchMany')
    const { result, stop } = scope(() => store.todos.liveQuery((q: any) => q.many()))
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))

    stop()
    release()
    await result

    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(0))
  })
})
