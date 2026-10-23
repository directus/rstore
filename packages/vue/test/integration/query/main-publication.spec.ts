import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real queries, live delivery and page loads execute against the fake backend.
// The held transport is obsolete after a main push; it must not block pages.
describe('main pushes release page publication independently of transport', () => {
  it.each([undefined, 5])('publishes a later fetched page after main push version %s', async (version) => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 6
        return ctx.next()
      } },
    })
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1 }), { pages: 'all' }))
    let more: any
    try {
      const main = await subscription(payloads)
      expect(main.setResult!([{ id: '1', title: 'Pushed main' }], { version })).toBe('applied')
      expect(query.mainPage.foreground.completed).toBe(true)
      more = query.fetchMore({ pageIndex: 1 })
      await vi.waitFor(() => expect(more.page.data).toEqual([{ id: '2', title: 'Two' }]))
      expect(more.page.loading).toBe(false)
      await more
    }
    finally {
      release()
      await query
      await more
    }
    expect(query.mainPage.data).toEqual([{ id: '1', title: version == null ? 'Pushed main' : 'One' }])
  })

  it.each(['fetch', 'push'] as const)('releases an already queued secondary %s once main result lands', async (delivery) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1 }), { pages: 'all' }))
    let more: any
    try {
      const main = await subscription(payloads)
      const page = delivery === 'fetch'
        ? (more = query.fetchMore({ pageIndex: 1 })).page
        : query.getPage({ pageIndex: 1 })
      if (delivery === 'fetch')
        await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(2))
      else
        expect((await subscription(payloads, 1)).setResult!([{ id: '2', title: 'Pushed two' }])).toBe('applied')
      expect(page.data).toEqual([])
      expect(main.setResult!([{ id: '1', title: 'Pushed main' }])).toBe('applied')
      await vi.waitFor(() => expect(page.data).toEqual([{ id: '2', title: delivery === 'fetch' ? 'Two' : 'Pushed two' }]))
      expect(page.loading).toBe(false)
      expect(query.data.value.map((row: any) => row.id)).toEqual(['1', '2'])
    }
    finally {
      release()
      await query
      await more
    }
  })

  it('keeps queued pages behind a replacement main load when the old transport settles', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const releaseFirst = remote.holdNext('fetchMany')
    onTestFinished(releaseFirst)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1, dedupe: false }), { pages: 'all' }))
    let releaseSecond: (() => void) | undefined
    let refresh: Promise<unknown> | undefined
    try {
      const main = await subscription(payloads)
      const page = query.getPage({ pageIndex: 1 })
      expect((await subscription(payloads, 1)).setResult!([{ id: '2', title: 'Queued two' }], { version: 5 })).toBe('applied')
      releaseSecond = remote.holdNext('fetchMany')
      onTestFinished(releaseSecond)
      refresh = query.refresh({ pages: [0] })
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(2))
      releaseFirst()
      await query
      expect(page.data).toEqual([])

      expect(main.setResult!([{ id: '1', title: 'Current main' }])).toBe('applied')
      await vi.waitFor(() => expect(page.data).toEqual([{ id: '2', title: 'Queued two' }]))
      expect(query.data.value.map((row: any) => row.title)).toEqual(['Current main', 'Queued two'])
    }
    finally {
      releaseFirst()
      releaseSecond?.()
      await query
      await refresh
    }
  })
})
