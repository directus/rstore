import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupLiveTodos, subscription, writeRows } from '../../utils/live-query'
import { drainGarbageCollection } from '../garbage-collection/utils'

// Real live query, page retries and cache publication; only backend replies are
// held. A newer accepted page push must survive a same-options retry, including
// protecting cached fields before the main page releases queued publication.
describe('versioned page pushes waiting for the main page', () => {
  it.each([
    ['no-cache', 4],
    ['no-cache', 6],
    ['fetch-only', 4],
    ['fetch-only', 6],
  ] as const)('orders a queued push against %s retry version %s', async (fetchPolicy, version) => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = version
        return ctx.next()
      } },
    })
    const release = remote.holdNext('fetchMany')
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy, resultMode: 'responseRefs', pageSize: 1 }), { pages: 'all' }))
    const page = query.getPage({ pageIndex: 1 })
    let retry: Promise<unknown> | undefined
    try {
      const second = await subscription(payloads, 1)
      if (fetchPolicy !== 'no-cache')
        writeRows(store, [{ id: '2', title: 'Push 5' }])
      expect(second.setResult!([{ id: '2', title: 'Push 5' }], { version: 5 })).toBe('applied')
      retry = query.fetchMore({ pageIndex: 1 })
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(2))
    }
    finally {
      release()
      await query
      await retry
    }
    expect(page.data.map((row: any) => [row.id, row.title])).toEqual([['2', version === 4 ? 'Push 5' : 'Two']])
    if (fetchPolicy !== 'no-cache')
      expect(store.todos.peekFirst('2')?.title).toBe(version === 4 ? 'Push 5' : 'Two')
    expect(query.error.value).toBeNull()
    expect(page.confirmed).toBe(true)
  })

  it('clears a queued version when a later unversioned push supersedes its wait', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const release = remote.holdNext('fetchMany')
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1, dedupe: false }), { pages: 'all' }))
    const page = query.getPage({ pageIndex: 1 })
    try {
      const second = await subscription(payloads, 1)
      expect(second.setResult!([{ id: '2', title: 'Old versioned push' }], { version: 5 })).toBe('applied')
      await query.refresh({ pages: [0] })
      expect(second.setResult!([{ id: '2', title: 'Latest unversioned push' }])).toBe('applied')
      await vi.waitFor(() => expect(page.data).toEqual([{ id: '2', title: 'Latest unversioned push' }]))
      remote.on('fetchMany', (ctx) => {
        ctx.payload.meta.$resultVersion = 4
        return ctx.next()
      })
      await query.fetchMore({ pageIndex: 1 })
      expect(page.data).toEqual([{ id: '2', title: 'Two' }])
    }
    finally {
      release()
      await query
    }
    expect(page.data).toEqual([{ id: '2', title: 'Two' }])
  })

  it.each(['disposed', 'options'] as const)('drops an accepted queued push after its owner is %s', async (reason) => {
    const { store, scope, remote, payloads } = await setupLiveTodos()
    const where = ref({})
    const release = remote.holdNext('fetchMany')
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1, params: { where: where.value } }), { pages: 'all' }))
    const query = owner.result
    const page = query.getPage({ pageIndex: 1 })
    try {
      const second = await subscription(payloads, 1)
      expect(second.setResult!([{ id: '2', title: 'Late push' }], { version: 5 })).toBe('applied')
      if (reason === 'disposed')
        owner.stop()
      else where.value = { title: 'One' }
      await nextTick()
    }
    finally {
      release()
      await query
      await query.foreground.promise
    }
    expect(page.data).toEqual([])
    expect(page.confirmed).toBe(false)
    expect(query.data.value.some((row: any) => row.title === 'Late push')).toBe(false)
  })

  it.each(['published', 'dropped'] as const)('owns the rows of a queued push until it is %s', async (outcome) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const where = ref({})
    const release = remote.holdNext('fetchMany')
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs', pageSize: 1, params: { where: where.value } }), { pages: 'all' }))
    const page = query.getPage({ pageIndex: 1 })
    try {
      const second = await subscription(payloads, 1)
      writeRows(store, [{ id: '3', title: 'Pushed three' }])
      expect(second.setResult!([{ id: '3', title: 'Pushed three' }], { version: 5 })).toBe('applied')
      // A sweep while the push waits for the main page must keep its rows.
      store.$cache.garbageCollect()
      expect(store.todos.peekFirst('3')?.title).toBe('Pushed three')
      if (outcome === 'dropped')
        where.value = { title: 'One' }
      await nextTick()
    }
    finally {
      release()
      await query
    }
    await drainGarbageCollection()
    if (outcome === 'published') {
      await vi.waitFor(() => expect(page.data.map((row: any) => row.id)).toEqual(['3']))
      expect(store.todos.peekFirst('3')?.title).toBe('Pushed three')
    }
    else {
      await vi.waitFor(() => expect(store.todos.peekFirst('3')).toBeNull())
    }
  })
})
