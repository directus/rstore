import { describe, expect, it } from 'vitest'
import { setupLiveTodos, setupTodos, subscription } from '../../utils/live-query'

// Real live-query pages and transport options execute against the fake backend.
// A subscription refresh reloads its query's own window, even when callers
// provide controls for another page; unrelated page values and fetch state stay
// intact, and the subscription itself is kept.
describe('main subscription refresh reloads its followed window', () => {
  it('hands live query subscriptions a refresh that refetches their query', async () => {
    const { store, remote, scope, payloads } = await setupTodos()
    const query = await scope(() => store.todos.liveQuery((q: any) => q.many())).result
    const main = await subscription(payloads)

    remote.seed('todos', [{ id: '1', title: 'Refreshed' }, { id: '2', title: 'Two' }])
    await main.refresh!()
    expect(remote.callCount('fetchMany')).toBe(2)
    expect(query.data.value.map((todo: any) => todo.title)).toEqual(['Refreshed', 'Two'])
  })

  it('reconciles subscription refresh results without deleting rows used by another query', async () => {
    const { store, remote, scope, run, payloads } = await setupTodos({
      data: { todos: [{ id: '1', title: 'One', done: false }, { id: '2', title: 'Two', done: false }] },
    })
    const query = await scope(() => store.todos.liveQuery((q: any) => q.many({
      params: { where: { done: false } },
    }))).result
    const sibling = await run(() => store.todos.query((q: any) => q.first('2')))
    // A resubscription would turn this refresh into a no-op.
    const main = await subscription(payloads)
    expect(query.data.value.map((todo: any) => todo.id)).toEqual(['1', '2'])

    // Only the filtered response changes: row 2 still exists on the server.
    remote.seed('todos', [{ id: '1', title: 'Fresh', done: false }, { id: '2', title: 'Two', done: true }])
    await main.refresh!({ resultMode: 'responseRefs' })

    expect(query.data.value.map((todo: any) => ({ id: todo.id, title: todo.title }))).toEqual([
      { id: '1', title: 'Fresh' },
    ])
    expect(sibling.data.value).toMatchObject({ id: '2', title: 'Two' })
    expect(store.todos.peekFirst('2')).toMatchObject({ id: '2', title: 'Two' })
    remote.seed('todos', [{ id: '1', title: 'Fresh', done: true }, { id: '2', title: 'Two', done: true }])
    await main.refresh!({ resultMode: 'responseRefs' })
    expect(query.data.value).toEqual([])
    expect(sibling.data.value).toMatchObject({ id: '2', title: 'Two' })
    expect(remote.callCount('subscribe')).toBe(1)
  })

  it.each([0, 1])('ignores page redirection when main index is %s', async (pageIndex) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({
      pageSize: 1,
      pageIndex,
      fetchPolicy: 'no-cache',
    }), { pages: 'all' }))
    const otherIndex = pageIndex === 0 ? 1 : 0
    const { page: other } = await query.fetchMore({ pageIndex: otherIndex })
    const otherData = other.data.map((item: any) => ({ ...item }))
    const otherUpdated = other.foreground.lastUpdated
    const main = await subscription(payloads)
    remote.seed('todos', [{ id: '1', title: 'Fresh one' }, { id: '2', title: 'Fresh two' }])

    await main.refresh!({ pageIndex: otherIndex, pages: [otherIndex] })

    expect(remote.callCount('fetchMany')).toBe(3)
    expect(remote.lastRequest('fetchMany')!.findOptions.pageIndex).toBe(pageIndex)
    expect(query.mainPage.index).toBe(pageIndex)
    expect(query.mainPage.data).toEqual(pageIndex === 0
      ? [{ id: '1', title: 'Fresh one' }]
      : [{ id: '2', title: 'Fresh two' }])
    expect(query.pages.value[otherIndex]).toBe(other)
    expect(other.data).toEqual(otherData)
    expect(other.foreground.lastUpdated).toBe(otherUpdated)
    expect(other.loading).toBe(false)
  })

  it('retains effective main-page filters when scoped refresh omits find overrides', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      data: { todos: [
        { id: '1', title: 'One', group: 'first' },
        { id: '2', title: 'Two', group: 'second' },
      ] },
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({
      pageSize: 1,
      fetchPolicy: 'no-cache',
      params: { where: { group: 'first' } },
    })))
    const main = await subscription(payloads)
    await query.refresh({ params: { where: { group: 'second' } } })

    await main.refresh!()

    expect(remote.lastRequest('fetchMany')!.findOptions.params).toEqual({ where: { group: 'second' } })
    // Refresh overrides shape loads, not the followed subscription.
    expect(payloads).toHaveLength(1)
    expect(query.data.value).toEqual([{ id: '2', title: 'Two', group: 'second' }])
  })

  it('keeps the main subscription across refresh overrides and a later plain refresh', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 2 })))
    const main = await subscription(payloads)

    await main.refresh!({ resultMode: 'responseRefs' })
    expect(remote.lastRequest('fetchMany')!.findOptions.resultMode).toBe('responseRefs')
    expect(main.setResult!([{ id: '2', title: 'Two' }])).toBe('applied')
    expect(query.data.value.map((row: any) => row.id)).toEqual(['2'])
    // Reconnect, autoRefresh, cache reset and invalidation all call plain refresh.
    await query.refresh()
    await main.refresh!({ resultMode: 'responseRefs' })

    expect(remote.callCount('fetchMany')).toBe(4)
    expect(payloads).toHaveLength(1)
    expect(remote.callCount('unsubscribe')).toBe(0)
  })

  it('keeps an unpaged subscription unpaged after scoped refresh', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const main = await subscription(payloads)
    expect(main.pageIndex).toBeUndefined()
    remote.seed('todos', [{ id: '2', title: 'Fresh two' }])

    await main.refresh!({ pageIndex: 9 })

    expect(remote.lastRequest('fetchMany')!.findOptions.pageIndex).toBeUndefined()
    expect(query.mainPage.options.pageIndex).toBeUndefined()
    expect(query.mainPage.index).toBe(0)
    expect(query.data.value).toEqual([{ id: '2', title: 'Fresh two' }])
    expect(payloads).toHaveLength(1)
  })
})
