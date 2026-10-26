import type { CustomHookMeta, FieldTimestampValue } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { setupLiveTodos, subscription, writeRows } from '../../utils/live-query'
import { drainGarbageCollection } from '../garbage-collection/utils'

// Real liveQuery, hook pipeline and cache; FakeRemote substitutes server replies.
// Versions and expected rows are independent literals. Ignoring versions breaks
// stale-result assertions; blindly superseding fetches breaks the newer reply.
describe('page result versions reject older server state', () => {
  it.each([4, 6])('orders an in-flight fetch at version %s against push 5 and collects rejected rows', async (version) => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      data: { todos: [{ id: '2', title: 'Fetched two' }, { id: '4', title: 'Fetched four' }] },
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = version
        ctx.payload.meta.totalCount = 40
        return ctx.next()
      } },
    })
    // Hold after cache writes to prove stale tracking is collected, not merely
    // that a request rejected before writing leaves an empty cache.
    const release = remote.holdNext('fetchRelations')
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs', include: {} })))
    try {
      const payload = await subscription(payloads)
      await vi.waitFor(() => expect(remote.callCount('fetchRelations')).toBe(1))
      expect(store.todos.peekFirst('4')?.title).toBe('Fetched four')
      remote.seed('todos', [{ id: '2', title: 'Pushed two' }, { id: '3', title: 'Pushed three' }])
      expect(payload.setResult!(remote.rows('todos'), { version: 5, meta: { totalCount: 30 } as CustomHookMeta })).toBe(version === 4 ? 'applied' : 'stale')
      // A newer fetch already writing reserves its snapshot until publication.
      expect(query.loading.value).toBe(version === 6)
      expect(query.foreground.completed.value).toBe(version === 4)
    }
    finally {
      release()
      await query
    }
    await drainGarbageCollection()
    expect(query.data.value.map((row: any) => [row.id, row.title])).toEqual(version === 4
      ? [['2', 'Pushed two'], ['3', 'Pushed three']]
      : [['2', 'Fetched two'], ['4', 'Fetched four']])
    expect(query.meta.value.totalCount).toBe(version === 4 ? 30 : 40)
    expect(query.meta.value.$resultVersion).toBeUndefined()
    expect(store.todos.peekFirst(version === 4 ? '4' : '3')).toBeNull()
    expect(query.loading.value).toBe(false)
    expect(query.error.value).toBeNull()
    expect(query.foreground.completed.value).toBe(true)
  })

  it.each([4, 6])('checks version %s before queued fetch writes overwrite pushed fields', async (version) => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = version
        return ctx.next()
      } },
    })
    const release = remote.holdNext('fetchMany')
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    try {
      const payload = await subscription(payloads)
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(1))
      payload.setResult!([{ id: '1', title: 'Pushed one' }], { version: 5 })
    }
    finally {
      release()
      await query
    }
    expect(query.data.value.map((row: any) => [row.id, row.title])).toEqual(version === 4
      ? [['1', 'Pushed one']]
      : [['1', 'One'], ['2', 'Two']])
    expect(store.todos.peekFirst('1')?.title).toBe(version === 4 ? 'Pushed one' : 'One')
  })

  it('keeps fetch 5 after push 4, accepts equal versions, and retains version across refresh', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 5
        ctx.payload.meta.totalCount = 2
        return ctx.next()
      } },
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const payload = await subscription(payloads)
    expect(payload.setResult!([{ id: '1', title: 'Old one' }], { version: 4, meta: { totalCount: 99 } as CustomHookMeta })).toBe('stale')
    expect(query.data.value).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    expect(query.meta.value.totalCount).toBe(2)
    expect(query.meta.value.$resultVersion).toBeUndefined()
    expect(payload.setResult!([{ id: '1', title: 'Echo one' }], { version: 5 })).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Echo one' }])
    remote.on('fetchMany', (ctx) => {
      ctx.payload.meta.$resultVersion = 4
      ctx.payload.meta.totalCount = 99
      return ctx.next()
    })
    await query.refresh()
    expect(query.data.value).toEqual([{ id: '1', title: 'Echo one' }])
    expect(query.meta.value.totalCount).toBe(2)
    expect(query.foreground.completed.value).toBe(true)
    expect(query.foreground.loading.value).toBe(false)
    expect(query.error.value).toBeNull()
    // Unversioned responses retain arrival-based behavior and do not inherit
    // the previous fetch's private version from public query metadata.
    remote.on('fetchMany', ctx => ctx.next())
    remote.seed('todos', [{ id: '1', title: 'Unversioned one' }])
    await query.refresh()
    expect(query.data.value).toEqual([{ id: '1', title: 'Unversioned one' }])
    expect(payload.setResult!([{ id: '1', title: 'Version restarted' }], { version: 1 })).toBe('applied')
    expect(payload.setResult!([{ id: '1', title: 'Unversioned push' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Unversioned push' }])
    expect(payload.setResult!([{ id: '1', title: 'Zero version' }], { version: 0 })).toBe('applied')
    expect(payload.setResult!([], { version: -1 })).toBe('stale')
  })

  it.each([
    ['0000000003e8:0002:a', '0000000003e8:0001:z'],
    ['0000000003e8:0002:b', '0000000003e8:0002:a'],
    ['0000000003e9:0000:a', 1000],
  ] satisfies Array<[FieldTimestampValue, FieldTimestampValue]>)('compares HLC %s against %s with field timestamp ordering', async (newer, older) => {
    const { store, run, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const payload = await subscription(payloads)
    expect(payload.setResult!([{ id: '1', title: 'New' }], { version: newer })).toBe('applied')
    expect(payload.setResult!([{ id: '1', title: 'Old' }], { version: older })).toBe('stale')
    expect(query.data.value).toEqual([{ id: '1', title: 'New' }])
  })

  it('publishes a versioned push when options hold an inline function', async () => {
    const { store, run, payloads } = await setupLiveTodos()
    // The options getter rebuilds this function on every read.
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', filter: () => true })))
    const payload = await subscription(payloads)
    expect(payload.setResult!([{ id: '1', title: 'Pushed' }], { version: 1 })).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Pushed' }])
    expect(payload.setResult!([], { version: 0 })).toBe('stale')
  })

  it('keeps versions per page and resets them when base options change', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const where = ref({})
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1, params: { where: where.value } }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    const main = await subscription(payloads)
    const second = await subscription(payloads, 1)
    expect(main.setResult!([{ id: '1', title: 'Main' }], { version: 10 })).toBe('applied')
    expect(second.setResult!([{ id: '2', title: 'Second' }], { version: 2 })).toBe('applied')
    await vi.waitFor(() => expect(query.data.value.map((row: any) => row.title)).toEqual(['Main', 'Second']))
    expect(second.setResult!([], { version: 1 })).toBe('stale')
    expect(query.data.value.map((row: any) => row.title)).toEqual(['Main', 'Second'])
    remote.on('fetchMany', (ctx) => {
      ctx.payload.meta.$resultVersion = 1
      return ctx.next()
    })
    where.value = { title: 'Two' }
    await vi.waitFor(() => expect(query.data.value).toEqual([{ id: '2', title: 'Two' }]))
    expect(main.setResult!([], { version: 20 })).toBe('inactive')
    const current = await subscription(payloads, 2)
    expect(current.setResult!([{ id: '2', title: 'Current' }], { version: 2 })).toBe('applied')
  })

  it('rejects stale cache writes when both deduped consumers received a newer push', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 4
        return ctx.next()
      } },
    })
    const release = remote.holdNext('fetchMany')
    const first = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const second = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    try {
      await subscription(payloads, 1)
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(1))
      for (const payload of payloads)
        payload.setResult!([{ id: '1', title: 'Pushed one' }], { version: 5 })
    }
    finally {
      release()
      await Promise.all([first, second])
    }
    for (const query of [first, second])
      expect(query.data.value.map((row: any) => row.title)).toEqual(['Pushed one'])
    expect(store.todos.peekFirst('1')?.title).toBe('Pushed one')
  })

  // The follower's refresh starts after the push, so only the shared response
  // version can tell its guard that this request predates the push.
  it('rejects stale cache writes for a consumer that joins an older request after a push', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 4
        return ctx.next()
      } },
    })
    const first = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const second = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    await Promise.all([first, second])
    await subscription(payloads, 1)
    const release = remote.holdNext('fetchMany')
    const leading = first.refresh()
    let following: Promise<unknown> | undefined
    try {
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(2))
      for (const payload of payloads)
        expect(payload.setResult!([{ id: '1', title: 'Pushed one' }], { version: 5 })).toBe('applied')
      following = second.refresh()
    }
    finally {
      release()
      await Promise.all([leading, following])
    }
    expect(remote.callCount('fetchMany')).toBe(2)
    for (const query of [first, second])
      expect(query.data.value.map((row: any) => row.title)).toEqual(['Pushed one'])
    expect(store.todos.peekFirst('1')?.title).toBe('Pushed one')
  })

  it.each([false, true])('shares fetch versions with deduped consumers (background: %s)', async (background) => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 5
        return ctx.next()
      } },
    })
    if (background)
      writeRows(store, [{ id: '1', title: 'Cached' }])
    const release = remote.holdNext('fetchMany')
    const options = { fetchPolicy: background ? 'cache-and-fetch' : 'no-cache', resultMode: 'responseRefs' }
    const first = run(() => store.todos.liveQuery((q: any) => q.many(options)))
    const second = run(() => store.todos.liveQuery((q: any) => q.many(options)))
    const completed = Promise.all([first, second]).then(() => Promise.all([first.background.promise, second.background.promise]))
    try {
      await subscription(payloads, 1)
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(1))
    }
    finally {
      release()
      await completed
    }
    for (const [index, query] of [first, second].entries()) {
      const payload = await subscription(payloads, index)
      expect(payload.setResult!([], { version: 4 })).toBe('stale')
      expect(query.data.value.map((row: any) => row.id)).toEqual(['1', '2'])
      expect(query.meta.value.$resultVersion).toBeUndefined()
      expect(query.background.loading.value).toBe(false)
    }
  })

  it('drops an unversioned fetch that started before a versioned push', async () => {
    // Without GC, a stale fetch's cache writes would remain observable.
    const { store, run, remote, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const payload = await subscription(payloads)
    remote.seed('todos', [{ id: '1', title: 'Fetched one' }, { id: '2', title: 'Two' }])
    const release = remote.holdNext('fetchMany')
    const refreshing = query.refresh()
    try {
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(2))
      expect(payload.setResult!([{ id: '3', title: 'Pushed three' }], { version: 5 })).toBe('applied')
    }
    finally {
      release()
      await refreshing
    }
    expect(query.data.value.map((row: any) => row.id)).toEqual(['3'])
    expect(store.todos.peekFirst('1')?.title).toBe('One')
    expect(query.loading.value).toBe(false)
    expect(query.error.value).toBeNull()
    // Work started after the push is newer by arrival and still applies.
    await query.refresh()
    expect(query.data.value.map((row: any) => [row.id, row.title])).toEqual([['1', 'Fetched one'], ['2', 'Two']])
  })
})
