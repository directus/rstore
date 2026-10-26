import type { SubscribePayload } from '../../utils/live-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'
import { setupTodos, subscription } from '../../utils/live-query'

// Real public query/transport queues with held external registrations expose
// stale recovery work. Remote lease identity is the cleanup oracle, not live alone.
describe('ended recovery respects replacement ownership', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('preserves replacement when another page blocks a superseded reopen', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const pageSize = ref(1)
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({
      pageSize: pageSize.value,
      fetchPolicy: 'no-cache',
    }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    const main = await subscription(payloads)
    const second = await subscription(payloads, 1)
    const release = remote.holdNext('subscribe')
    try {
      // Page 1 holds the shared queue; page 0's reopen cannot enter yet.
      second.end!({ retry: true })
      main.end!({ retry: true })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1000)
      expect(remote.callCount('subscribe')).toBe(3)
      expect(payloads).toHaveLength(2)
      pageSize.value = 2
      await vi.advanceTimersByTimeAsync(0)
    }
    finally {
      release()
    }
    const current = await subscription(payloads, 3)
    await vi.advanceTimersByTimeAsync(0)
    expect(query.live.value).toBe(true)
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    expect(current.findOptions.pageSize).toBe(2)
    expect(current.setResult!([{ id: '1', title: 'Replacement' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Replacement' }])
  })

  it('preserves queued replacement when an obsolete reopen rejects', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const key = ref('1')
    const query = await run(() => store.todos.liveQuery((q: any) => q.first({ key: key.value, fetchPolicy: 'no-cache' })))
    const original = await subscription(payloads)
    const release = remote.holdNext('subscribe')
    remote.failNext('subscribe')
    try {
      original.end!({ retry: true })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1000)
      expect(remote.callCount('subscribe')).toBe(2)
      key.value = '2'
      await vi.advanceTimersByTimeAsync(0)
    }
    finally {
      release()
    }
    await vi.advanceTimersByTimeAsync(0)
    expect(payloads).toHaveLength(2)
    const current = payloads[1]!
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    expect(query.live.value).toBe(true)
    expect(query.data.value).toEqual({ id: '2', title: 'Two' })
  })

  it.each(['refresh', 'push'])('renews retry budget after an accepted %s', async (delivery) => {
    const { store, run, remote, payloads } = await setupTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    await subscription(payloads)
    for (let cycle = 0; cycle < 4; cycle++) {
      // Push-only connectors can deliver a healthy result even if gap fetch fails.
      if (delivery === 'push')
        remote.failNext('fetchMany')
      payloads[cycle]!.end!({ retry: true })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(999)
      expect(payloads).toHaveLength(cycle + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(payloads).toHaveLength(cycle + 2)
      const current = payloads[cycle + 1]!
      if (delivery === 'push')
        expect(current.setResult!([{ id: '1', title: 'Healthy push' }])).toBe('applied')
      expect(query.live.value).toBe(true)
      expect(remote.subscriptions()).toEqual([current.subscriptionId])
    }
    expect(query.data.value).toEqual(delivery === 'push'
      ? [{ id: '1', title: 'Healthy push' }]
      : [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
  })

  it('closes a lease ended synchronously inside subscribe without publishing live', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    store.$hooks.hook('subscribe', (payload: SubscribePayload) => payload.end!({ retry: false }))
    const query = run(() => store.todos.liveQuery((q: any) => q.first({ key: '1', fetchPolicy: 'no-cache' })))
    const states: boolean[] = []
    run(() => watch(query.live, live => states.push(live), { flush: 'sync' }))
    await query
    const original = await subscription(payloads)
    await vi.advanceTimersByTimeAsync(0)
    expect(remote.subscriptions()).toEqual([])
    expect(query.live.value).toBe(false)
    expect(remote.callCount('fetchFirst')).toBe(2)
    expect(states).toEqual([])
    expect(original.setResult!({ id: '1', title: 'Late' })).toBe('inactive')
  })

  it('handles watcher close failures in plain subscribe and preserves explicit rejection', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const key = ref('1')
    const followed = run(() => store.todos.subscribe((s: any) => s(key.value)))
    const original = await subscription(payloads)
    remote.failNext('unsubscribe')
    key.value = '2'
    await vi.advanceTimersByTimeAsync(0)
    expect(followed.live.value).toBe(false)
    expect(remote.subscriptions()).toEqual([original.subscriptionId])
    key.value = '3'
    const current = await subscription(payloads, 1)
    await vi.advanceTimersByTimeAsync(0)
    expect(followed.live.value).toBe(true)
    expect(current.key).toBe('3')
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    remote.failNext('unsubscribe')
    await expect(followed.unsubscribe()).rejects.toThrow('fake-remote: unsubscribe failed')
    await followed.unsubscribe()
    expect(remote.subscriptions()).toEqual([])
  })
})
