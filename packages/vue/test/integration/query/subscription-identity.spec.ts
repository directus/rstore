import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupTodos, subscription } from '../../utils/live-query'

// Real stores, option resolution and Vue lifetimes; only remote storage is fake.
// Transport counts catch needless reopening. Retained callbacks must publish and
// refresh using current options, while changed server reads reject old delivery.
describe('subscription identity follows server reads', () => {
  it.each([
    { fetchPolicy: 'no-cache' },
    { dedupe: false },
    { experimentalGarbageCollection: true },
    { fetchOptions: { autoRefresh: 'manual' } },
  ])('keeps live subscription for client-only change %j', async (change) => {
    const { store, run, remote, payloads, read } = await setupTodos()
    const options = ref<Record<string, any>>({ fetchPolicy: 'cache-only', resultMode: 'responseRefs' })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many(options.value)))
    const original = await subscription(payloads)
    options.value = { ...options.value, ...change }
    await nextTick()
    await query.foreground.promise
    expect(original.setResult!([{ id: '3', title: 'Pushed' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '3', title: 'Pushed' }])
    if (change.fetchPolicy === 'no-cache') {
      expect(read('todos', '3')).toBeUndefined()
      await original.refresh!()
      expect(remote.lastRequest('fetchMany')!.findOptions.fetchPolicy).toBe('no-cache')
      expect(query.data.value).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    }
    expect(remote.callCount('subscribe')).toBe(1)
    expect(remote.callCount('unsubscribe')).toBe(0)
  })

  it('keeps raw-different options that resolve to the same server read', async () => {
    const { store, run, remote, payloads } = await setupTodos({ findDefaults: { pageSize: 2 } })
    const options = ref<Record<string, any>>({ fetchPolicy: 'no-cache' })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many(options.value)))
    const original = await subscription(payloads)
    options.value = { fetchPolicy: 'no-cache', pageSize: 2, resultMode: 'computed' }
    expect(original.setResult!([{ id: '1', title: 'Equivalent' }])).toBe('applied')
    await nextTick()
    await query.foreground.promise
    expect(remote.callCount('subscribe')).toBe(1)
    expect(remote.callCount('unsubscribe')).toBe(0)
  })

  it('reopens when metadata changes the resolved server read', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    store.$hooks.hook('resolveFindOptions', ({ meta, updateFindOptions }: any) => {
      updateFindOptions({ params: { where: { title: meta.title ?? 'One' } } })
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const original = await subscription(payloads)
    query.meta.value.title = 'Two'
    expect(original.setResult!([])).toBe('inactive')
    const current = await subscription(payloads, 1)
    expect(current.findOptions.params).toEqual({ where: { title: 'Two' } })
    await current.refresh!()
    expect(query.data.value).toEqual([{ id: '2', title: 'Two' }])
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
  })

  it('keeps a followed page through equivalent options changed by its public input', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1 }), { pages: 'all' }))
    const pageOptions = ref({ pageIndex: 1, fetchPolicy: 'no-cache' })
    await query.fetchMore(pageOptions.value)
    const second = await subscription(payloads, 1)
    pageOptions.value.fetchPolicy = 'fetch-only'
    expect(second.setResult!([{ id: '2', title: 'Pushed two' }])).toBe('applied')
    await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Pushed two' }]))
    await second.refresh!()
    expect(remote.lastRequest('fetchMany')!.findOptions).toMatchObject({ pageIndex: 1, fetchPolicy: 'fetch-only' })
    expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Two' }])
    expect(remote.callCount('subscribe')).toBe(2)
    expect(remote.callCount('unsubscribe')).toBe(0)
  })

  it('keeps plain subscribe through client-only changes and retains opening teardown options', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const fetchPolicy = ref('cache-only')
    const handle = run(() => store.todos.subscribe(() => ({ key: 0, fetchPolicy: fetchPolicy.value })))
    const original = await subscription(payloads)
    fetchPolicy.value = 'no-cache'
    await nextTick()
    await handle.unsubscribe()
    expect(remote.callCount('subscribe')).toBe(1)
    expect(remote.lastRequest('unsubscribe')).toMatchObject({ key: 0, findOptions: original.findOptions })
    expect(remote.subscriptions()).toEqual([])
  })

  it('keeps a held registration through equivalent options and uses current callbacks', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const tag = ref('cache-only')
    const release = remote.holdNext('subscribe')
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', fetchOptions: { autoRefresh: tag.value } })))
    try {
      await vi.waitFor(() => expect(remote.callCount('subscribe')).toBe(1))
      tag.value = 'manual'
      await nextTick()
      await query.foreground.promise
    }
    finally {
      release()
    }
    const original = await subscription(payloads)
    expect(original.setResult!([{ id: '1', title: 'Current' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Current' }])
    await original.refresh!()
    expect(remote.lastRequest('fetchMany')!.findOptions.fetchOptions.autoRefresh).toBe('manual')
    expect(remote.callCount('subscribe')).toBe(1)
    expect(remote.callCount('unsubscribe')).toBe(0)
  })

  it('replaces an invalidated subscription when rapid changes restore its first identity', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const tag = ref(1)
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', params: { tag: tag.value } })))
    const original = await subscription(payloads)
    // Hold teardown while options return to their previous server read.
    // The superseded owner must stay inactive after its replacement opens.
    const release = remote.holdNext('unsubscribe')
    try {
      tag.value = 2
      expect(original.setResult!([])).toBe('inactive')
      await vi.waitFor(() => expect(remote.callCount('unsubscribe')).toBe(1))
      tag.value = 1
      await nextTick()
    }
    finally {
      release()
    }
    const current = await subscription(payloads, 1)
    expect(original.setResult!([])).toBe('inactive')
    expect(current.setResult!([{ id: '1', title: 'Restored' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Restored' }])
    expect(remote.subscriptions()).toEqual([current.subscriptionId])
  })

  it('uses current resolution metadata when queued teardown finally permits opening', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    store.$hooks.hook('resolveFindOptions', ({ findOptions, meta, updateFindOptions }: any) => {
      updateFindOptions({ params: { ...findOptions.params, context: meta.context } })
    })
    const tag = ref(1)
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', params: { tag: tag.value } })))
    await subscription(payloads)
    const release = remote.holdNext('unsubscribe')
    try {
      tag.value = 2
      await vi.waitFor(() => expect(remote.callCount('unsubscribe')).toBe(1))
      query.meta.value.context = 'updated while closing'
    }
    finally {
      release()
    }
    const current = await subscription(payloads, 1)
    expect(current.findOptions!.params).toEqual({ tag: 2, context: 'updated while closing' })
  })

  it('reopens for changed server options and resultMode', async () => {
    const { store, run, remote, payloads } = await setupTodos()
    const options = ref<Record<string, any>>({ fetchPolicy: 'no-cache', params: { where: { title: 'One' } } })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many(options.value)))
    const original = await subscription(payloads)
    options.value = { ...options.value, params: { where: { title: 'Two' } } }
    const second = await subscription(payloads, 1)
    expect(original.setResult!([])).toBe('inactive')
    await vi.waitFor(() => expect(query.data.value).toEqual([{ id: '2', title: 'Two' }]))
    options.value = { ...options.value, resultMode: 'responseRefs' }
    const third = await subscription(payloads, 2)
    expect(second.setResult!([])).toBe('inactive')
    expect(remote.subscriptions()).toEqual([third.subscriptionId])
    expect(remote.callCount('unsubscribe')).toBe(2)
  })
})
