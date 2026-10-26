import type { SubscribePayload } from '../../utils/live-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watch } from 'vue'
import { setupTodos, subscription } from '../../utils/live-query'

// Public liveQuery API, real hooks/cache/queue and Vue scopes; only backend is
// fake. Changed rows prove gap refresh, remote leases prove cleanup, and old
// callbacks must reject delivery synchronously after an end notification.
describe('server-ended live queries recover without stale ownership', () => {
  // Control the recovery/backoff algorithm while keeping query and queue real.
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())
  it('reopens after backoff and refreshes only the ended page once', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({
      pageSize: 1,
      fetchPolicy: 'no-cache',
    }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    const main = await subscription(payloads)
    const ended = await subscription(payloads, 1)
    await vi.waitFor(() => expect(query.live.value).toBe(true))

    ended.end!({ reason: 'rerun failed', retry: true })
    expect(query.live.value).toBe(false)
    expect(ended.setResult!([{ id: '2', title: 'Stale' }])).toBe('inactive')
    await ended.refresh!()
    ended.end!({ retry: true }) // Duplicate and late notifications are inert.
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([main.subscriptionId]))
    expect(remote.callCount('fetchMany')).toBe(2)
    remote.seed('todos', [{ id: '1', title: 'One' }, { id: '2', title: 'Changed while ended' }])
    await vi.advanceTimersByTimeAsync(1000)
    expect(payloads).toHaveLength(3)
    const current = payloads[2]!
    await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Changed while ended' }]))
    expect(remote.callCount('fetchMany')).toBe(3)
    expect(remote.callCount('subscribe')).toBe(3)
    await vi.waitFor(() => expect(query.live.value).toBe(true))
    expect(remote.subscriptions()).toEqual([main.subscriptionId, current.subscriptionId])
    expect(remote.lastRequest('fetchMany')!.findOptions.pageIndex).toBe(1)
    expect(query.mainPage.data).toEqual([{ id: '1', title: 'One' }])
    expect(current.setResult!([{ id: '2', title: 'Fresh push' }])).toBe('applied')
    await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Fresh push' }]))
  })

  it('permanently ends, refreshes once and reports live false', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    const ended = await subscription(payloads)
    remote.seed('todos', [{ id: '1', title: 'Updated' }])
    ended.end!({ reason: 'forbidden', retry: false })
    expect(query.live.value).toBe(false)
    await vi.waitFor(() => expect(query.data.value?.title).toBe('Updated'))
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([]))
    await vi.advanceTimersByTimeAsync(1100)
    expect(remote.callCount('fetchFirst')).toBe(2)
    expect(remote.callCount('subscribe')).toBe(1)
    expect(ended.setResult!({ id: '1', title: 'Stale' })).toBe('inactive')
    expect(query.live.value).toBe(false)
  })

  it('cancels backoff when server-read options change', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const key = ref('1')
    const query = await run(() => store.todos.liveQuery((q: any) => q.first(key.value)))
    const ended = await subscription(payloads)
    const pendingTimers = vi.getTimerCount()
    ended.end!({ retry: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(remote.subscriptions()).toEqual([])
    expect(vi.getTimerCount()).toBe(pendingTimers + 1)
    key.value = '2'
    const current = await subscription(payloads, 1)
    await query.foreground.promise
    expect(vi.getTimerCount()).toBe(pendingTimers)
    await vi.advanceTimersByTimeAsync(8000)
    expect(payloads).toHaveLength(2)
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    expect(query.data.value).toEqual({ id: '2', title: 'Two' })
    expect(query.live.value).toBe(true)
  })

  it('cancels pending recovery when owner scope stops', async () => {
    const { store, scope, remote, payloads } = await setupTodos()
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const query = await owner.result
    const ended = await subscription(payloads)
    ended.end!({ retry: true })
    owner.stop()
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([]))
    await vi.advanceTimersByTimeAsync(1100)
    expect(remote.callCount('subscribe')).toBe(1)
    expect(query.live.value).toBe(false)
  })

  it.each(['disabled', 'deselected'])('cancels recovery when page becomes %s', async (change) => {
    const { store, run, remote, payloads } = await setupTodos()
    const enabled = ref(true)
    const pages = ref([0])
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ enabled: enabled.value }), { pages }))
    const original = await subscription(payloads)
    original.end!({ retry: true })
    if (change === 'disabled')
      enabled.value = false
    else
      pages.value = []
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([]))
    await vi.advanceTimersByTimeAsync(1100)
    expect(remote.callCount('subscribe')).toBe(1)
    expect(remote.callCount('fetchMany')).toBe(1)
    expect(query.live.value).toBe(false)
  })

  it.each([true, false])('reports live false for ordinary queries (server: %s)', async (isServer) => {
    const { store, run } = await setupTodos({ isServer })
    const query = await run(() => isServer
      ? store.todos.liveQuery((q: any) => q.many())
      : store.todos.query((q: any) => q.many()))
    expect(query.live.value).toBe(false)
  })

  it('bounds immediate repeated kickouts without an accepted result', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const original = await subscription(payloads)
    store.$hooks.hook('subscribe', (payload: SubscribePayload) => payload.end!({ retry: true }))
    original.end!({ retry: true })
    await vi.advanceTimersByTimeAsync(0)
    for (const delay of [1000, 2000, 4000]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(query.live.value).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
    }
    expect(remote.subscriptions()).toEqual([])
    expect(payloads).toHaveLength(4)
    expect(remote.callCount('fetchMany')).toBe(2)
    await vi.advanceTimersByTimeAsync(8000)
    expect(payloads).toHaveLength(4)
    expect(query.live.value).toBe(false)
  })

  it('keeps plain subscriptions free of live-query recovery callbacks', async () => {
    const { store, run, payloads } = await setupTodos()
    run(() => store.todos.subscribe())
    const plain = await subscription(payloads)
    expect(plain.end).toBeUndefined()
    expect(plain.setResult).toBeUndefined()
    expect(plain.refresh).toBeUndefined()
    await nextTick()
  })

  it('preserves option changes made synchronously by a live-state observer', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const key = ref('1')
    const query = await run(() => store.todos.liveQuery((q: any) => q.first(key.value)))
    const original = await subscription(payloads)
    await vi.waitFor(() => expect(query.live.value).toBe(true))
    run(() => watch(query.live, (live) => {
      if (!live)
        key.value = '2'
    }, { flush: 'sync' }))
    original.end!({ retry: false })
    const current = await subscription(payloads, 1)
    await vi.waitFor(() => expect(query.data.value).toEqual({ id: '2', title: 'Two' }))
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    expect(query.live.value).toBe(true)
  })

  it('keeps liveness steady while a retained page refreshes', async () => {
    const { store, run, payloads } = await setupTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    await subscription(payloads)
    await vi.waitFor(() => expect(query.live.value).toBe(true))
    const states: boolean[] = []
    run(() => watch(query.live, live => states.push(live), { flush: 'sync' }))
    await query.refresh()
    expect(states).toEqual([])
    expect(query.live.value).toBe(true)
  })

  it('cleans partial failed registrations and stops after the bounded budget', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const original = await subscription(payloads)
    store.$hooks.hook('subscribe', () => {
      throw new Error('registration failed after lease acquisition')
    })
    original.end!({ retry: true })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(7000)
    expect(remote.callCount('fetchMany')).toBe(2)
    expect(payloads).toHaveLength(4)
    expect(remote.subscriptions()).toEqual([])
    expect(query.live.value).toBe(false)
    for (const payload of payloads)
      expect(payload.setResult!([{ id: '9', title: 'Stale' }])).toBe('inactive')
    await vi.advanceTimersByTimeAsync(1100)
    expect(remote.callCount('subscribe')).toBe(4)
    expect(remote.callCount('fetchMany')).toBe(2)
  }, 12000)

  it('does not publish recovery or refresh after options change during registration', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const key = ref('1')
    const query = await run(() => store.todos.liveQuery((q: any) => q.first({ key: key.value, fetchPolicy: 'no-cache' })))
    const original = await subscription(payloads)
    const release = remote.holdNext('subscribe')
    try {
      original.end!({ retry: true })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1000)
      expect(remote.callCount('subscribe')).toBe(2)
      expect(query.live.value).toBe(false)
      key.value = '2'
      await vi.waitFor(() => expect(query.data.value).toEqual({ id: '2', title: 'Two' }))
    }
    finally {
      release()
    }
    const abandoned = await subscription(payloads, 1)
    const current = await subscription(payloads, 2)
    await vi.waitFor(() => expect(query.live.value).toBe(true))
    expect(abandoned.setResult!({ id: '1', title: 'Late' })).toBe('inactive')
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    expect(remote.callCount('fetchFirst')).toBe(2)
    expect(query.data.value).toEqual({ id: '2', title: 'Two' })
  })

  it('finishes bounded recovery even when teardown keeps failing', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const key = ref('1')
    const query = await run(() => store.todos.liveQuery((q: any) => q.first({ key: key.value, fetchPolicy: 'no-cache' })))
    const original = await subscription(payloads)
    remote.on('unsubscribe', () => {
      throw new Error('teardown offline')
    })
    original.end!({ retry: true })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(7000)
    expect(remote.callCount('fetchFirst')).toBe(2)
    expect(query.live.value).toBe(false)
    expect(remote.callCount('subscribe')).toBe(1)
    remote.on('unsubscribe', null)
    key.value = '2'
    const current = await subscription(payloads, 1)
    await vi.waitFor(() => expect(query.live.value).toBe(true))
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    expect(query.data.value).toEqual({ id: '2', title: 'Two' })
  }, 12000)
})
