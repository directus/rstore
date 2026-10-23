import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real query/cache APIs keep page membership, sibling ownership and transport
// options observable. Only server replies come from the shared fake backend.
describe('live refresh keeps overrides and ownership scoped to its page', () => {
  it('replaces secondary response membership while retaining sibling cache rows', async () => {
    const { store, run, remote, payloads, read } = await setupLiveTodos({
      experimentalGarbageCollection: false,
      data: { todos: [
        { id: '1', title: 'One', done: false },
        { id: '2', title: 'Two', done: false },
        { id: '3', title: 'Three', done: false },
      ] },
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, params: { where: { done: false } } }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    await query.fetchMore({ pageIndex: 2 })
    const sibling = await run(() => store.todos.query((q: any) => q.first({ key: '2', fetchPolicy: 'cache-only' })))
    const second = await subscription(payloads, 1)
    remote.seed('todos', [
      { id: '1', title: 'One', done: false },
      { id: '2', title: 'Two', done: true },
      { id: '3', title: 'Three', done: false },
    ])

    await second.refresh!({ resultMode: 'responseRefs', pages: [0] })

    expect(query.pages.value[1].data.map((row: any) => row.id)).toEqual(['3'])
    expect(query.mainPage.data.map((row: any) => row.id)).toEqual(['1'])
    expect(query.pages.value[2].data.map((row: any) => row.id)).toEqual(['3'])
    expect(query.data.value.map((row: any) => row.id)).toEqual(['1', '3', '3'])
    expect(sibling.data.value.id).toBe('2')
    expect(read('todos', '2')?.id).toBe('2')
    expect(remote.lastRequest('fetchMany')!.findOptions).toMatchObject({ pageIndex: 1, resultMode: 'responseRefs' })
  })

  it('sends secondary find overrides without replacing main options or page index', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      data: { todos: [
        { id: '1', title: 'One', group: 'first' },
        { id: '2', title: 'Two', group: 'first' },
        { id: '3', title: 'Three', group: 'second' },
        { id: '4', title: 'Four', group: 'second' },
      ] },
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, fetchPolicy: 'no-cache', params: { where: { group: 'first' } } }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    const second = await subscription(payloads, 1)

    await second.refresh!({ params: { where: { group: 'second' } }, pageIndex: 0 })

    expect(remote.lastRequest('fetchMany')!.findOptions).toMatchObject({ pageIndex: 1, params: { where: { group: 'second' } } })
    expect(query.mainPage.options).toEqual({})
    expect(query.data.value).toEqual([
      { id: '1', title: 'One', group: 'first' },
      { id: '4', title: 'Four', group: 'second' },
    ])
  })

  it('keeps a cursor page subscription across refreshes without adding a page index', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, fetchPolicy: 'no-cache' }), { pages: 'all' }))
    await query.fetchMore({ params: { after: '1' } })
    const cursor = await subscription(payloads, 1)
    expect(cursor.findOptions).not.toHaveProperty('pageIndex')

    await cursor.refresh!({ resultMode: 'responseRefs' })
    expect(remote.lastRequest('fetchMany')!.findOptions).toMatchObject({ params: { after: '1' }, resultMode: 'responseRefs' })
    expect(remote.lastRequest('fetchMany')!.findOptions).not.toHaveProperty('pageIndex')
    expect(cursor.setResult!([{ id: '2', title: 'Pushed two' }])).toBe('applied')
    await query.refresh()

    expect(remote.requests('fetchMany').filter((request: any) => 'pageIndex' in request.findOptions)).toEqual([])
    expect(payloads).toHaveLength(2)
    expect(remote.callCount('unsubscribe')).toBe(0)
  })

  it('follows a base option change beneath retained refresh overrides', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const title = ref('One')
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ params: { where: { title: title.value } }, fetchPolicy: 'no-cache' })))
    const payload = await subscription(payloads)
    await query.refresh({ params: { where: { title: 'One' } } })

    title.value = 'Two'
    await nextTick()
    await query.foreground.promise
    await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(3))
    // The retained override still shapes the load; the subscription follows base options.
    expect(remote.lastRequest('fetchMany')!.findOptions.params).toEqual({ where: { title: 'One' } })
    expect(payload.setResult!([])).toBe('inactive')
    const current = await subscription(payloads, 1)
    expect(current.findOptions!.params).toEqual({ where: { title: 'Two' } })
    expect(current.setResult!([{ id: '1', title: 'Pushed one' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Pushed one' }])
  })
})
