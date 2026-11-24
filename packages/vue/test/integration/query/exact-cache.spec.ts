import { hydrate } from '#test-utils/store/ssr'
import { describe, expect, it, vi } from 'vitest'
import { setupExactTodos } from './exact-todos'

describe('exact saved query results', () => {
  it('fetches before displaying a page whose saved rows are incomplete', async () => {
    const server = await setupExactTodos({ isServer: true })
    const source = await server.run(() => server.store.todos.query(q => q.many({ resultMode: 'responseRefs', fetchPolicy: 'cache-and-fetch' })))
    await source.background.promise
    const state = server.cache.getState()
    expect(source.data.value.map(item => item.id)).toContain('1')
    delete state.collections.todos!['1']

    const client = await setupExactTodos()
    hydrate(client.cache, state)
    const release = client.remote.holdNext('fetchMany')
    const query = client.run(() => client.store.todos.query(q => q.many({ resultMode: 'responseRefs', fetchPolicy: 'cache-and-fetch' })))
    try {
      await vi.waitFor(() => expect(client.remote.callCount('fetchMany')).toBe(1))
      expect(query.data.value).toEqual([])
      expect(query.loading.value).toBe(true)
    }
    finally {
      release()
      await query.background.promise
    }
    expect(query.data.value.map(item => item.id)).toContain('1')
    expect(query.mainPage.cacheStatus).toBe('complete')
  })

  it('reuses a complete empty response without fetching again under cache-first', async () => {
    const server = await setupExactTodos({ isServer: true, data: { todos: [] } })
    await server.run(() => server.store.todos.query(q => q.many({ resultMode: 'responseRefs' })))

    const client = await setupExactTodos()
    hydrate(client.cache, server.cache.getState())
    const query = await client.run(() => client.store.todos.query(q => q.many({ resultMode: 'responseRefs' })))
    expect(query.confirmed.value).toBe(true)
    expect(query.data.value).toEqual([])
    expect(client.remote.callCount('fetchMany')).toBe(0)
  })
})

describe('exact results after a missed realtime delete', () => {
  it('never revives an omitted row on later warm opens while shared cache retains it', async () => {
    const stack = await setupExactTodos({ schema: [{ name: 'todos', garbageCollection: { maxSize: 8 } }] })
    const open = () => stack.store.todos.query(q => q.many({ resultMode: 'responseRefs', fetchPolicy: 'cache-and-fetch' }))
    const first = stack.scope(open)
    await first.result.background.promise
    expect(first.result.data.value.map(row => row.id)).toEqual(['1', '2'])
    const collection = stack.store.$collections[0]!
    stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: 'One' }, retain: true })
    first.stop()
    stack.remote.seed('todos', [{ id: '2', title: 'Two' }])
    const second = stack.scope(open)
    await second.result.background.promise
    expect(second.result.data.value.map(row => row.id)).toEqual(['2'])
    expect(stack.store.todos.peekFirst('1')?.id).toBe('1')
    second.stop()
    stack.cache.garbageCollect()

    const release = stack.remote.holdNext('fetchMany')
    const later = stack.run(open)
    try {
      await later
      expect(later.data.value.map(row => row.id)).toEqual(['2'])
    }
    finally {
      release()
      await later.background.promise
    }
    expect(later.data.value.map(row => row.id)).toEqual(['2'])
  })

  it('retains a warm page during a transient error and discards it on access denial', async () => {
    const stack = await setupExactTodos()
    const query = await stack.run(() => stack.store.todos.query(q => q.many({ resultMode: 'responseRefs' })))
    stack.remote.failNext('fetchMany', new Error('Offline'))
    await query.refresh()
    expect(query.data.value.map(row => row.id)).toEqual(['1', '2'])
    stack.remote.failNext('fetchMany', Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await query.refresh()
    expect(query.data.value).toEqual([])
    expect(query.mainPage.cacheStatus).toBe('miss')
    expect(query.confirmed.value).toBe(false)
  })
})

describe('exact query retention', () => {
  it('expires standalone fetch markers and inactive page keys within configured budgets', async () => {
    const stack = await setupExactTodos({ queryStateRetention: { maxSize: 1, maxKeys: 1 } })
    const query = stack.scope(() => stack.store.todos.query(q => q.many({ resultMode: 'responseRefs' })))
    await query.result
    expect(query.result.data.value.length).toBe(2)
    query.stop()

    await stack.store.todos.findMany({ params: { where: { id: '1' } }, fetchPolicy: 'fetch-only' })
    await stack.store.todos.findMany({ params: { where: { id: '2' } }, fetchPolicy: 'fetch-only' })
    stack.cache.garbageCollect()
    const snapshot = stack.cache.getState()
    expect(Object.keys(snapshot.pageRefs ?? {})).toHaveLength(0)
    expect(Object.keys(snapshot.markers)).toHaveLength(1)
  })
})

it('does not reuse an exact snapshot after the authenticated cache is cleared', async () => {
  const stack = await setupExactTodos()
  const query = await stack.run(() => stack.store.todos.query(q => q.many({ resultMode: 'responseRefs' })))
  expect(query.data.value.map(row => row.id)).toEqual(['1', '2'])
  stack.remote.seed('todos', [{ id: 'new-account', title: 'New account' }])
  const release = stack.remote.holdNext('fetchMany')
  stack.cache.clear()
  try {
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(2))
    expect(query.data.value).toEqual([])
    expect(query.mainPage.cacheStatus).toBe('miss')
  }
  finally {
    release()
    await query.foreground.promise
  }
  expect(query.data.value.map(row => row.id)).toEqual(['new-account'])
})

it('reclaims an unreferenced row before breaking a reusable exact page', async () => {
  const stack = await setupExactTodos({
    schema: [{ name: 'todos', garbageCollection: { maxSize: 1 } }],
    data: { todos: [{ id: 'warm', title: 'Warm page' }] },
  })
  const open = () => stack.store.todos.query(q => q.many({ resultMode: 'responseRefs' }))
  const initial = stack.scope(open)
  await initial.result
  initial.stop()
  stack.store.todos.writeItem({ id: 'spare', title: 'No saved page' })
  stack.cache.garbageCollect()

  const query = await stack.run(open)
  expect(query.data.value.map(row => row.id)).toEqual(['warm'])
  expect(stack.store.todos.peekFirst('spare')).toBeFalsy()
  expect(stack.remote.callCount('fetchMany')).toBe(1)
})
