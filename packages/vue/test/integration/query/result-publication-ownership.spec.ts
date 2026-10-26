import type { CustomHookMeta } from '@rstore/shared'
import { describe, expect, it, onTestFinished } from 'vitest'
import { nextTick, watch } from 'vue'
import { setupLiveTodos, subscription, writeRows } from '../../utils/live-query'
import { drainGarbageCollection } from '../garbage-collection/utils'

// Real query publication and synchronous Vue observers run against FakeRemote.
// Every nested accepted publication owns rows, metadata and cache retention.
describe('nested result publications own rows, metadata and cache retention', () => {
  it.each([6, 5, undefined])('keeps nested confirmation publication (version %s)', async (version) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const main = await subscription(payloads)
    const stop = watch(query.confirmed, (confirmed) => {
      if (confirmed)
        main.setResult!([{ id: '1', title: 'Nested' }], { version, meta: { totalCount: 2 } as CustomHookMeta })
    }, { flush: 'sync' })
    onTestFinished(stop)
    expect(main.setResult!([{ id: '1', title: 'Outer' }], { version: 5, meta: { totalCount: 1 } as CustomHookMeta })).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Nested' }])
    expect(query.meta.value.totalCount).toBe(2)
    if (version === 6)
      expect(main.setResult!([], { version: 5 })).toBe('stale')
  })

  it.each(['no-cache', 'cache-and-fetch'] as const)('keeps nested push ownership after %s fetch publication', async (fetchPolicy) => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 5
        ctx.payload.meta.totalCount = 1
        return ctx.next()
      } },
    })
    if (fetchPolicy === 'cache-and-fetch')
      writeRows(store, [{ id: '3', title: 'Cached' }])
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy, resultMode: 'responseRefs' })))
    const main = await subscription(payloads)
    if (fetchPolicy === 'cache-and-fetch')
      await query
    const stop = watch(() => query.mainPage.data[0]?.title, (title) => {
      if (title === 'One') {
        main.setResult!([{ id: '4', title: 'Nested' }], { version: 6, meta: { totalCount: 2 } as CustomHookMeta })
      }
    }, { flush: 'sync' })
    onTestFinished(stop)
    release()
    await query
    await query.background.promise
    await nextTick()
    await drainGarbageCollection()
    expect(query.data.value.map((row: any) => ({ id: row.id, title: row.title }))).toEqual([{ id: '4', title: 'Nested' }])
    expect(query.meta.value.totalCount).toBe(2)
    if (fetchPolicy === 'cache-and-fetch')
      expect(store.todos.peekFirst('4')?.title).toBe('Nested')
  })

  it('cancels deferred prune when completion observer publishes a newer snapshot', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      experimentalGarbageCollection: false,
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 5
        return ctx.next()
      } },
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const main = await subscription(payloads)
    remote.seed('todos', [{ id: '1', title: 'Refreshed' }])
    const stop = watch(query.foreground.completed, (completed) => {
      if (completed) {
        main.setResult!([{ id: '4', title: 'Nested' }], { version: 6 })
      }
    }, { flush: 'sync' })
    onTestFinished(stop)
    await query.refresh({ prune: true })
    expect(query.data.value.map((row: any) => row.id)).toEqual(['4'])
    expect(store.todos.peekFirst('4')?.title).toBe('Nested')
  })
})
