import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupTodos, subscription } from '../../utils/live-query'

// Real query builders, option resolution and subscription lifecycle. Only the
// remote is fake. Raw options, wrong cardinality or lost keys change these wire
// assertions; each stack owns teardown, including after a failed assertion.
describe('subscribe payload matches the resolved server read', () => {
  it.each([0, 1])('resolves defaults and filters for followed page %s', async (pageIndex) => {
    const { store, run, remote, payloads } = await setupTodos({
      findDefaults: { pageSize: 1, fetchPolicy: 'no-cache' },
      data: { todos: [
        { id: '1', title: 'One', done: false },
        { id: '2', title: 'Two', done: true },
        { id: '3', title: 'Three', done: false },
      ] },
    })
    store.$hooks.hook('resolveFindOptions', ({ findOptions, updateFindOptions }: any) => {
      updateFindOptions({ params: { ...findOptions.params, where: { done: false } } })
    })

    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ params: { orderBy: 'id' } }), { pages: 'all' }))
    if (pageIndex === 1)
      await query.fetchMore({ pageIndex })
    const followed = await subscription(payloads, pageIndex)
    expect(followed.findOptions).toMatchObject({
      pageSize: 1,
      fetchPolicy: 'no-cache',
      params: { orderBy: 'id', where: { done: false } },
    })
    expect(followed.findOptions).toEqual(remote.lastRequest('fetchMany')!.findOptions)
    expect(followed.pageIndex).toBe(pageIndex)
    expect(query.pages.value[pageIndex].data.map((row: any) => row.id)).toEqual([pageIndex === 0 ? '1' : '3'])
  })

  it.each(['1', 0])('exposes key %s for live first and plain subscribe', async (key) => {
    const { store, run, payloads } = await setupTodos()
    await run(() => store.todos.liveQuery((q: any) => q.first(key)))
    const live = await subscription(payloads)
    run(() => store.todos.subscribe((s: any) => s(key)))
    const plain = await subscription(payloads, 1)

    for (const payload of [live, plain]) {
      expect(payload.key).toBe(key)
      expect(payload.findOptions).toMatchObject({ key })
      expect(payload.pageIndex).toBeUndefined()
    }
    expect(plain.refresh).toBeUndefined()
    expect(plain.setResult).toBeUndefined()
  })

  it('isolates opening options from connector mutations before teardown', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    store.$hooks.hook('subscribe', ({ findOptions }: any) => {
      findOptions.params.topic = 'mutated'
    })
    const handle = run(() => store.todos.subscribe(() => ({ params: { topic: 'opening' } })))
    await subscription(payloads)
    await handle.unsubscribe()
    expect(remote.lastRequest('unsubscribe')!.findOptions.params).toEqual({ topic: 'opening' })
  })

  it('resolves no-argument subscribe once with many defaults', async () => {
    const { store, run, payloads } = await setupTodos({ findDefaults: { pageSize: 3 } })
    const cardinalities: boolean[] = []
    store.$hooks.hook('resolveFindOptions', ({ many }: { many: boolean }) => {
      cardinalities.push(many)
    })
    const handle = run(() => store.todos.subscribe())
    const opened = await subscription(payloads)
    expect(cardinalities).toEqual([true])
    expect(opened.findOptions.pageSize).toBe(3)
    expect(handle.live.value).toBe(true)
    await handle.unsubscribe()
    expect(handle.live.value).toBe(false)
  })

  it('resolves each newly selected page once and reuses reads for ended callbacks', async () => {
    const { store, run, payloads } = await setupTodos({
      data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }, { id: '3', title: 'Three' }] },
    })
    let resolutions = 0
    store.$hooks.hook('resolveFindOptions', () => {
      resolutions++
    })
    const pages = ref<number[]>([])
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1 }), { pages }))
    await query.fetchMore({ pageIndex: 1 })
    await query.fetchMore({ pageIndex: 2 })
    await nextTick()
    resolutions = 0
    pages.value = [0, 1, 2]
    const third = await subscription(payloads, 2)
    expect(resolutions).toBe(3)
    resolutions = 0
    third.end!({ retry: false })
    expect(resolutions).toBe(0)
  })

  it('resolves plain options and closes the original resolved topic after options change', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    store.$hooks.hook('resolveFindOptions', ({ findOptions, updateFindOptions }: any) => {
      updateFindOptions({ params: { where: { title: findOptions.params?.search } } })
    })
    const search = ref('One')
    const handle = run(() => store.todos.subscribe(() => ({ params: { search: search.value } })))
    const first = await subscription(payloads)
    expect(first.findOptions).toMatchObject({ params: { where: { title: 'One' } } })
    search.value = 'Two'
    const second = await subscription(payloads, 1)
    expect(second.findOptions).toMatchObject({ params: { where: { title: 'Two' } } })
    expect(remote.lastRequest('unsubscribe')).toMatchObject({ subscriptionId: first.subscriptionId, findOptions: first.findOptions })
    await handle.unsubscribe()
    expect(remote.subscriptions()).toEqual([])
    expect(remote.lastRequest('unsubscribe')).toMatchObject({ subscriptionId: second.subscriptionId, findOptions: second.findOptions })
  })

  it('resolves first without a key as singular and uses current query meta when reopening', async () => {
    const { store, run, payloads } = await setupTodos()
    store.$hooks.hook('resolveFindOptions', ({ many, meta, findOptions, updateFindOptions }: any) => {
      updateFindOptions({ params: { ...findOptions.params, cardinality: many ? 'many' : 'first', context: meta.context } })
    })
    const search = ref('One')
    const query = await run(() => store.todos.liveQuery((q: any) => q.first({ params: { search: search.value } })))
    const first = await subscription(payloads)
    expect(first.findOptions).toMatchObject({ params: { cardinality: 'first' } })
    query.meta.value.context = 'current'
    search.value = 'Two'
    const reopened = await subscription(payloads, 1)
    expect(reopened.findOptions).toMatchObject({ params: { search: 'Two', cardinality: 'first', context: 'current' } })
    expect(reopened.key).toBeUndefined()
    await vi.waitFor(() => expect(query.loading.value).toBe(false))
  })
})
