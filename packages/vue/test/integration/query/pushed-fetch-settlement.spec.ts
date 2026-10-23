import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { setupLiveTodos, subscription, writeRows } from '../../utils/live-query'

// Real fetch lanes and page publication run against held backend replies.
// A newer accepted response still owns its successful settlement after a push.
describe('fetch settlement after a push records only accepted snapshots', () => {
  it('records background success after newer fetched snapshot replaces a push', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      experimentalGarbageCollection: false,
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 6
        return ctx.next()
      } },
    })
    writeRows(store, [{ id: '1', title: 'Cache' }])
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'cache-and-fetch', resultMode: 'responseRefs' })))
    try {
      await query
      const main = await subscription(payloads)
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(1))
      writeRows(store, [{ id: '1', title: 'Push' }])
      expect(main.setResult!([{ id: '1', title: 'Push' }], { version: 5 })).toBe('applied')
    }
    finally {
      release()
    }
    await vi.waitFor(() => expect(query.data.value.map((row: any) => row.title)).toEqual(['One', 'Two']))
    await query.background.promise
    await vi.waitFor(() => expect(query.background.completed.value).toBe(true), { timeout: 200 })
    expect(query.mainPage.background.completed).toBe(true)
    expect(query.background.lastUpdated.value).not.toBeNull()
  })

  it('records foreground success time after newer fetched snapshot replaces a push', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 6
        return ctx.next()
      } },
    })
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    let pushedAt: number
    try {
      const main = await subscription(payloads)
      expect(main.setResult!([{ id: '1', title: 'Push' }], { version: 5 })).toBe('applied')
      pushedAt = query.foreground.lastUpdated.value!
      await vi.waitFor(() => expect(Date.now()).toBeGreaterThan(pushedAt))
    }
    finally {
      release()
      await query
    }
    expect(query.data.value.map((row: any) => row.title)).toEqual(['One', 'Two'])
    expect(query.foreground.lastUpdated.value).toBeGreaterThan(pushedAt!)
    expect(query.mainPage.foreground.lastUpdated).toBeGreaterThan(pushedAt!)
  })

  it('does not record freshness for a discarded older fetched snapshot', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.$resultVersion = 4
        return ctx.next()
      } },
    })
    const release = remote.holdNext('fetchMany')
    onTestFinished(release)
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    let pushedAt: number
    try {
      const main = await subscription(payloads)
      expect(main.setResult!([{ id: '1', title: 'Push' }], { version: 5 })).toBe('applied')
      pushedAt = query.foreground.lastUpdated.value!
      await vi.waitFor(() => expect(Date.now()).toBeGreaterThan(pushedAt))
    }
    finally {
      release()
      await query
    }
    expect(query.data.value).toEqual([{ id: '1', title: 'Push' }])
    expect(query.foreground.lastUpdated.value).toBe(pushedAt!)
    expect(query.mainPage.foreground.lastUpdated).toBe(pushedAt!)
    expect(query.error.value).toBeNull()
  })
})
