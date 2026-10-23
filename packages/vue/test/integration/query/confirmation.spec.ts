import { hydrate } from '#test-utils/store/ssr'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupTodos, subscription } from '../../utils/live-query'

// Real query/cache publication is exercised through collection APIs. Only the
// backend is scripted. Missing publication, cache-as-server guesses and stale
// ownership must fail these public confirmation/data assertions.
describe('result confirmation distinguishes server results from cache guesses', () => {
  it('confirms cache-and-fetch only after the held background result lands', async () => {
    const { store, run, remote } = await setupTodos()
    await store.todos.findMany()
    remote.seed('todos', [{ id: '1', title: 'Fresh' }])
    const release = remote.holdNext('fetchMany')
    const query = await run(() => store.todos.query((q: any) => q.many({ fetchPolicy: 'cache-and-fetch' })))
    try {
      expect(query.data.value[0].title).toBe('One')
      expect(query.confirmed.value).toBe(false)
      expect(query.mainPage.confirmed).toBe(false)
    }
    finally {
      release()
      await query.background.promise
    }
    expect(query.data.value[0].title).toBe('Fresh')
    expect(query.confirmed.value).toBe(true)
    expect(query.mainPage.confirmed).toBe(true)
  })

  it.each(['cache-only', 'cache-first'] as const)('does not confirm a %s cache read or later local writes', async (fetchPolicy) => {
    const { store, run, remote } = await setupTodos()
    await store.todos.findMany()
    const query = await run(() => store.todos.query((q: any) => q.many({ fetchPolicy })))
    expect(query.data.value).toHaveLength(2)
    expect(query.confirmed.value).toBe(false)
    store.todos.writeItem({ id: '1', title: 'Local' })
    await nextTick()
    expect(query.data.value[0].title).toBe('Local')
    expect(query.mainPage.confirmed).toBe(false)
    expect(remote.callCount('fetchMany')).toBe(1)
  })

  it.each(['fetch-only', 'no-cache', 'cache-first'] as const)('confirms a %s server fetch, including empty and missing results', async (fetchPolicy) => {
    const { store, run, remote } = await setupTodos({ data: { todos: [] } })
    const many = await run(() => store.todos.query((q: any) => q.many({ fetchPolicy })))
    const first = await run(() => store.todos.query((q: any) => q.first({ key: 'missing', fetchPolicy })))
    expect(many.data.value).toEqual([])
    expect(first.data.value).toBeNull()
    expect(many.confirmed.value).toBe(true)
    expect(first.mainPage.confirmed).toBe(true)
    expect(remote.callCount('fetchMany')).toBe(1)
    expect(remote.callCount('fetchFirst')).toBe(1)
  })

  it('confirms pushes without fetching and rejects old-scope delivery', async () => {
    const { store, scope, remote, payloads } = await setupTodos()
    const child = scope(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'cache-only' })))
    const query = await child.result
    const payload = await subscription(payloads)
    expect(query.confirmed.value).toBe(false)
    expect(payload.setResult!([])).toBe('applied')
    expect(query.data.value).toEqual([])
    expect(query.confirmed.value).toBe(true)
    expect(remote.callCount('fetchMany')).toBe(0)
    child.stop()
    expect(payload.setResult!([{ id: '1', title: 'Late' }])).toBe('inactive')
    expect(query.data.value).toEqual([])
  })

  it('keeps a pushed confirmation when an older fetch finishes', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const release = remote.holdNext('fetchMany')
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    try {
      const payload = await subscription(payloads)
      expect(query.confirmed.value).toBe(false)
      payload.setResult!([{ id: '1', title: 'Pushed' }])
      expect(query.confirmed.value).toBe(true)
    }
    finally {
      release()
      await query
    }
    expect(query.data.value).toEqual([{ id: '1', title: 'Pushed' }])
    expect(query.confirmed.value).toBe(true)
  })

  it.each(['reactive', 'refresh'] as const)('clears confirmation on %s option changes until new fetch lands', async (mode) => {
    const { store, run, remote } = await setupTodos()
    const key = ref('1')
    const query = await run(() => store.todos.query((q: any) => q.first({ key: key.value, fetchPolicy: 'no-cache' })))
    expect(query.confirmed.value).toBe(true)
    const release = remote.holdNext('fetchFirst')
    let refreshing: Promise<unknown> | undefined
    try {
      if (mode === 'reactive')
        key.value = '2'
      else refreshing = query.refresh({ key: '2' })
      await vi.waitFor(() => expect(remote.callCount('fetchFirst')).toBe(2))
      expect(query.confirmed.value).toBe(false)
      expect(query.mainPage.confirmed).toBe(false)
    }
    finally {
      release()
      await refreshing
      await query.foreground.promise
    }
    expect(query.data.value.title).toBe('Two')
    expect(query.confirmed.value).toBe(true)
  })

  it.each(['computed', 'responseRefs'] as const)('retains %s confirmation on remount and clears it on cache reset', async (resultMode) => {
    const { store, scope, run, remote } = await setupTodos()
    const child = scope(() => store.todos.query((q: any) => q.many({ pageSize: 1, resultMode })))
    await child.result
    child.stop()
    const query = await run(() => store.todos.query((q: any) => q.many({ pageSize: 1, resultMode })))
    expect(query.data.value[0].title).toBe('One')
    expect(query.confirmed.value).toBe(true)
    expect(remote.callCount('fetchMany')).toBe(1)
    const release = remote.holdNext('fetchMany')
    try {
      store.$cache.clear()
      expect(query.confirmed.value).toBe(false)
      expect(query.mainPage.confirmed).toBe(false)
    }
    finally {
      release()
      await query.foreground.promise
    }
    expect(query.confirmed.value).toBe(true)
  })

  it('requires every existing page, ignores holes and preserves confirmation across local writes', async () => {
    const { store, run } = await setupTodos()
    const query = await run(() => store.todos.query((q: any) => q.many({ pageSize: 1 })))
    expect(query.confirmed.value).toBe(true)
    const page = query.getPage({ pageIndex: 2 })
    expect(page.confirmed).toBe(false)
    expect(query.confirmed.value).toBe(false)
    await query.fetchMore({ pageIndex: 2 })
    expect(query.confirmed.value).toBe(true)
    store.todos.writeItem({ id: '3', title: 'Local' })
    await nextTick()
    expect(page.confirmed).toBe(true)
    expect(query.confirmed.value).toBe(true)
  })

  it.each(['computed', 'responseRefs'] as const)('hydrates a confirmed SSR %s page without client fetch', async (resultMode) => {
    const server = await setupTodos({ isServer: true })
    await server.run(() => server.store.todos.query((q: any) => q.many({ pageSize: 1, resultMode })))
    const client = await setupTodos()
    hydrate(client.cache, server.cache.getState())
    const query = await client.run(() => client.store.todos.query((q: any) => q.many({ pageSize: 1, resultMode })))
    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])
    expect(query.confirmed.value).toBe(true)
    expect(query.mainPage.confirmed).toBe(true)
    expect(client.remote.callCount('fetchMany')).toBe(0)
  })

  it('hydrates a confirmed not-found result without a client request', async () => {
    const server = await setupTodos()
    await server.run(() => server.store.todos.query((q: any) => q.first('missing')))
    const client = await setupTodos()
    hydrate(client.cache, server.cache.getState())
    const query = await client.run(() => client.store.todos.query((q: any) => q.first('missing')))
    expect(query.data.value).toBeNull()
    expect(query.confirmed.value).toBe(true)
    expect(client.remote.callCount('fetchFirst')).toBe(0)
  })

  it('clears confirmation when an optionless query becomes disabled', async () => {
    const { store, run, remote } = await setupTodos()
    const enabled = ref(true)
    const query = await run(() => store.todos.query((q: any) => q.many(enabled.value ? {} : { enabled: false })))
    expect(query.confirmed.value).toBe(true)
    enabled.value = false
    await nextTick()
    expect(query.confirmed.value).toBe(false)
    expect(remote.callCount('fetchMany')).toBe(1)
  })

  it('cannot confirm an unconfirmed disposed page through its old push callback', async () => {
    const { store, scope, payloads } = await setupTodos()
    const child = scope(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'cache-only' })))
    const query = await child.result
    const payload = await subscription(payloads)
    child.stop()
    expect(payload.setResult!([])).toBe('inactive')
    expect(query.mainPage.confirmed).toBe(false)
    expect(query.confirmed.value).toBe(false)
  })

  it('unconfirms cached pages when their collection is cleared', async () => {
    const { store, run } = await setupTodos()
    const query = await run(() => store.todos.query((q: any) => q.many({ resultMode: 'responseRefs' })))
    const uncached = await run(() => store.todos.query((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    store.$cache.clearCollection({ collection: store.$collections[0] })
    await nextTick()
    expect(query.data.value).toEqual([])
    expect(query.confirmed.value).toBe(false)
    // No-cache pages show server rows the cleared cache never held.
    expect(uncached.confirmed.value).toBe(true)
    await query.refresh()
    expect(query.data.value).toHaveLength(2)
    expect(query.confirmed.value).toBe(true)
  })

  it('keeps cache snapshots detached from later page-ref changes', async () => {
    const { store, cache, run } = await setupTodos()
    await run(() => store.todos.query((q: any) => q.first('missing')))
    const snapshot = cache.getState()
    const saved = structuredClone(snapshot.pageRefs)
    store.todos.writeItem({ id: 'missing', title: 'Found' })
    await nextTick()
    expect(snapshot.pageRefs).toEqual(saved)
    const client = await setupTodos()
    client.cache.setState(snapshot)
    client.store.todos.writeItem({ id: 'missing', title: 'Found' })
    await nextTick()
    expect(snapshot.pageRefs).toEqual(saved)
  })
})
