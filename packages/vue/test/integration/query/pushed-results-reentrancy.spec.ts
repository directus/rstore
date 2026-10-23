import type { CustomHookMeta } from '@rstore/shared'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { watch } from 'vue'
import { setupLiveTodos, subscription, writeRows } from '../../utils/live-query'
import { drainGarbageCollection } from '../garbage-collection/utils'

// Real query/watch/disposal paths execute; only transport replies are held.
// Publication may synchronously start a new owner or end the current one.
describe('pushed results respect synchronous observer ownership', () => {
  it.each([undefined, 5])('keeps replacement fetch and barrier owned by the refresh (push version %s)', async (version) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1, dedupe: false }), { pages: 'all' }))
    const main = await subscription(payloads)
    const page = query.getPage({ pageIndex: 1 })
    const second = await subscription(payloads, 1)
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    let refresh: Promise<unknown> | undefined
    let mainTitleAtSecondaryPublication: string | undefined
    const stopMain = watch(() => query.mainPage.data[0]?.title, (title) => {
      if (title === 'Push')
        refresh = query.refresh({ pages: [0] })
    }, { flush: 'sync' })
    const stopSecond = watch(() => page.data[0]?.title, (title) => {
      if (title === 'Second')
        mainTitleAtSecondaryPublication = query.mainPage.data[0]?.title
    }, { flush: 'sync' })
    onTestFinished(stopMain)
    onTestFinished(stopSecond)
    try {
      expect(main.setResult!([{ id: '1', title: 'Push' }], { version })).toBe('applied')
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(2))
      expect(query.mainPage.loading).toBe(true)
      expect(query.loading.value).toBe(true)
      expect(second.setResult!([{ id: '2', title: 'Second' }])).toBe('applied')
    }
    finally {
      release()
      await refresh
      stopMain()
    }
    await vi.waitFor(() => expect(page.data).toEqual([{ id: '2', title: 'Second' }]))
    stopSecond()
    expect(mainTitleAtSecondaryPublication).toBe('One')
    expect(query.loading.value).toBe(false)
  })

  it.each([undefined, 5])('releases old loading when publication starts replacement work (push version %s)', async (version) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', dedupe: false })))
    const main = await subscription(payloads)
    let refresh: Promise<unknown> | undefined
    const stop = watch(() => query.mainPage.data[0]?.title, (title) => {
      if (title === 'Push')
        refresh = query.refresh()
    }, { flush: 'sync' })
    onTestFinished(stop)
    try {
      expect(main.setResult!([{ id: '1', title: 'Push' }], { version })).toBe('applied')
      await vi.waitFor(() => expect(refresh).toBeDefined())
      await refresh
      expect(query.mainPage.data[0]?.title).toBe('One')
      expect(query.loading.value).toBe(false)
      expect(query.mainPage.loading).toBe(false)
    }
    finally {
      stop()
      release()
      await query
    }
  })

  it.each([undefined, 5])('keeps metadata from a nested newer push (outer version %s)', async (version) => {
    const { store, run, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const main = await subscription(payloads)
    const stop = watch(() => query.mainPage.data[0]?.title, (title) => {
      if (title === 'Outer')
        main.setResult!([{ id: '1', title: 'Inner' }], { version: 6, meta: { totalCount: 2 } as CustomHookMeta })
    }, { flush: 'sync' })
    try {
      expect(main.setResult!([{ id: '1', title: 'Outer' }], { version, meta: { totalCount: 1 } as CustomHookMeta })).toBe('applied')
      expect(query.data.value).toEqual([{ id: '1', title: 'Inner' }])
      expect(query.meta.value.totalCount).toBe(2)
    }
    finally {
      stop()
    }
  })

  it('does not reacquire cache ownership after a pushed-data observer disposes its scope', async () => {
    const { store, scope, payloads } = await setupLiveTodos()
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const query = await owner.result
    const main = await subscription(payloads)
    const stop = watch(() => query.data.value.map((row: any) => row.id).join(','), (ids) => {
      if (ids === '3')
        owner.stop()
    }, { flush: 'sync' })
    try {
      writeRows(store, [{ id: '3', title: 'Three' }])
      expect(main.setResult!([{ id: '3', title: 'Three' }])).toBe('applied')
      expect(main.setResult!([])).toBe('inactive')
      await drainGarbageCollection()
      const item = store.todos.peekFirst('3')
      if (item)
        store.$cache.garbageCollectItem({ collection: store.$collections[0], item })
      expect(store.todos.peekFirst('3')).toBeNull()
    }
    finally {
      stop()
      owner.stop()
    }
  })
})
