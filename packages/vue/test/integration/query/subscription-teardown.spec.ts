import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real subscription queues, page scopes and callbacks run against the shared
// fake backend, which scripts teardown failures. A failed teardown keeps its
// transport identity for a later retry without restoring delivery, and never
// blocks cleanup of healthy subscriptions; exact active identities, current
// page rows and callback rejection expose leaks and stale ownership.
describe('failed subscription teardown is retried without reviving old callbacks', () => {
  it('retries the failed subscription while preserving another active subscription', async () => {
    const { store, scope, remote } = await setupLiveTodos()
    const first = scope(() => store.todos.subscribe((s: any) => s('1'))).result
    scope(() => store.todos.subscribe((s: any) => s('2')))
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(2))
    const firstId = remote.requests('subscribe')[0]!.subscriptionId
    const secondId = remote.requests('subscribe')[1]!.subscriptionId
    const failure = new Error('unsubscribe offline')
    remote.failNext('unsubscribe', failure)

    await expect(first.unsubscribe()).rejects.toBe(failure)
    expect(remote.subscriptions()).toEqual([firstId, secondId])
    await first.unsubscribe()

    expect(remote.subscriptions()).toEqual([secondId])
    expect(remote.requests('unsubscribe').map(call => call.subscriptionId)).toEqual([firstId, firstId])
  })

  it('keeps old pushes inactive while a later transition retries failed teardown', async () => {
    const { store, scope, remote, payloads } = await setupLiveTodos()
    const where = ref({ title: 'One' })
    const query = await scope(() => store.todos.liveQuery((q: any) => q.many({
      fetchPolicy: 'no-cache',
      params: { where: where.value },
    }))).result
    const original = await subscription(payloads)
    const originalId = original.subscriptionId
    const failure = new Error('unsubscribe offline')
    const release = remote.holdNext('unsubscribe')
    remote.failNext('unsubscribe', failure)
    try {
      where.value = { title: 'Two' }
      await vi.waitFor(() => expect(remote.callCount('unsubscribe')).toBe(1))
      expect(original.setResult!([{ id: '9', title: 'Stale' }])).toBe('inactive')
      // Enqueue recovery before the held rejection reaches the first transition.
      where.value = { title: 'One' }
      await nextTick()
    }
    finally {
      release()
    }
    await vi.waitFor(() => expect(remote.callCount('subscribe')).toBe(2))
    const current = await subscription(payloads, 1)
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
    expect(remote.requests('unsubscribe').map(call => call.subscriptionId)).toEqual([originalId, originalId])
    expect(original.setResult!([{ id: '9', title: 'Stale' }])).toBe('inactive')
    expect(current.setResult!([{ id: '1', title: 'Current' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Current' }])
  })

  it('retries deselected page teardown before opening its replacement', async () => {
    const { store, scope, remote, payloads } = await setupLiveTodos()
    const pages = ref([0, 1])
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({
      fetchPolicy: 'no-cache',
      pageSize: 1,
    }), { pages }))
    const query = await owner.result
    await query.fetchMore({ pageIndex: 1 })
    const main = await subscription(payloads)
    const original = await subscription(payloads, 1)
    const release = remote.holdNext('unsubscribe')
    remote.failNext('unsubscribe', new Error('offline teardown'))
    try {
      pages.value = [0]
      await vi.waitFor(() => expect(remote.callCount('unsubscribe')).toBe(1))
      pages.value = [0, 1]
      await nextTick()
    }
    finally {
      release()
    }
    try {
      const current = await subscription(payloads, 2)
      expect(remote.subscriptions()).toEqual([main.subscriptionId, current.subscriptionId])
      expect(remote.requests('unsubscribe').map(call => call.subscriptionId)).toEqual([original.subscriptionId, original.subscriptionId])
      expect(original.setResult!([{ id: '2', title: 'Stale' }])).toBe('inactive')
      expect(current.setResult!([{ id: '2', title: 'Current' }])).toBe('applied')
      await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Current' }]))
      expect(query.mainPage.data).toEqual([{ id: '1', title: 'One' }])
    }
    finally {
      owner.stop()
    }
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([]))
  })

  it('keeps disposal work queued when an earlier teardown retry fails again', async () => {
    const { store, scope, remote, payloads } = await setupLiveTodos()
    const pages = ref([0, 1, 2])
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({
      fetchPolicy: 'no-cache',
      pageSize: 1,
    }), { pages }))
    const query = await owner.result
    await query.fetchMore({ pageIndex: 1 })
    await query.fetchMore({ pageIndex: 2 })
    await subscription(payloads, 2)
    let attempts = 0
    remote.on('unsubscribe', (ctx) => {
      if (++attempts <= 2)
        throw new Error('teardown still offline')
      return ctx.next()
    })
    const release = remote.holdNext('unsubscribe')
    try {
      pages.value = [0, 2]
      await vi.waitFor(() => expect(remote.callCount('unsubscribe')).toBe(1))
      owner.stop()
    }
    finally {
      release()
    }
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([]))
  })

  it('resumes failed page replacement after another page transition retries teardown', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, fetchPolicy: 'no-cache' }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    const original = await subscription(payloads, 1)
    remote.failNext('unsubscribe', new Error('teardown offline'))

    // Changing identifying page options replaces the page subscription.
    query.pages.value[1].options = { pageIndex: 1, params: { after: 'changed' } }
    await vi.waitFor(() => expect(remote.callCount('unsubscribe')).toBe(1))
    expect(original.setResult!([{ id: '2', title: 'Stale' }])).toBe('inactive')
    await query.fetchMore({ pageIndex: 2 })
    await vi.waitFor(() => expect(payloads.some(payload => payload.pageIndex === 2)).toBe(true))

    const current = payloads.find(payload => payload.pageIndex === 1 && payload !== original)
    expect(current?.findOptions?.params).toEqual({ after: 'changed' })
    expect(remote.subscriptions()).toEqual(payloads.filter(payload => payload !== original).map(payload => payload.subscriptionId))
    expect(current!.setResult!([{ id: '2', title: 'Recovered' }])).toBe('applied')
    await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Recovered' }]))
    expect(query.mainPage.data).toEqual([{ id: '1', title: 'One' }])
  })

  it('closes healthy pages despite persistent failure on a deselected page', async () => {
    const { store, scope, remote, payloads } = await setupLiveTodos()
    const pages = ref([0, 1])
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, fetchPolicy: 'no-cache' }), { pages }))
    const query = await owner.result
    await query.fetchMore({ pageIndex: 1 })
    const broken = await subscription(payloads, 1)
    remote.on('unsubscribe', (ctx) => {
      if (ctx.subscriptionId === broken.subscriptionId)
        throw new Error('page teardown stays offline')
      return ctx.next()
    })

    pages.value = [0]
    await vi.waitFor(() => expect(remote.callCount('unsubscribe')).toBe(1))
    // Block this index's replacement while an unrelated newly selected page
    // still opens. Repeated failures must not create duplicate subscriptions.
    pages.value = [0, 1, 2]
    await query.fetchMore({ pageIndex: 2 })
    await subscription(payloads, 2)
    expect(remote.subscriptions()).toEqual(payloads.map(payload => payload.subscriptionId))
    expect(payloads.map(payload => payload.pageIndex)).toEqual([0, 1, 2])
    owner.stop()
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([broken.subscriptionId]))
    for (const payload of payloads)
      expect(payload.setResult!([{ id: '9', title: 'Disposed' }])).toBe('inactive')
    expect(query.data.value.map((row: any) => row.id)).toEqual(['1', '2'])
    await nextTick()
    expect(remote.callCount('subscribe')).toBe(3)
  })

  it('fences partially registered subscriptions and closes them before retrying', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, fetchPolicy: 'no-cache' }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    const original = await subscription(payloads, 1)
    let failed = false
    // This provider hook fails after the shared remote has acquired the lease.
    // Cleanup must retain that identity even though registration never completed.
    store.$hooks.hook('subscribe', (payload: typeof original) => {
      const params = payload.findOptions?.params as Record<string, unknown> | undefined
      if (!failed && params?.after === 'changed') {
        failed = true
        throw new Error('registration completion failed')
      }
    })

    // Changing identifying page options replaces the page subscription.
    query.pages.value[1].options = { pageIndex: 1, params: { after: 'changed' } }
    const rejected = await subscription(payloads, 2)
    await vi.waitFor(() => expect(failed).toBe(true))
    await nextTick()
    expect(rejected.setResult!([{ id: '2', title: 'Rejected registration' }])).toBe('inactive')
    expect(remote.subscriptions()).toContain(rejected.subscriptionId)

    await query.fetchMore({ pageIndex: 2 })
    await vi.waitFor(() => expect(payloads.some(payload => payload.pageIndex === 2)).toBe(true))
    const current = payloads.find(payload => payload.pageIndex === 1 && payload !== original && payload !== rejected)
    expect(current?.findOptions?.params).toEqual({ after: 'changed' })
    expect(remote.subscriptions()).toEqual(payloads.filter(payload => payload !== original && payload !== rejected).map(payload => payload.subscriptionId))
    expect(current!.setResult!([{ id: '2', title: 'Recovered registration' }])).toBe('applied')
    await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Recovered registration' }]))
  })
})
