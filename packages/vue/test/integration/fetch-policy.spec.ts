import type { VueStackOptions } from '#test-utils/store/vueStack'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'

// Fetch policies are unit-tested against stubbed collection hooks. Here they
// run against a real backend through the plugin pipeline, so the request
// count and the resulting cache state are both observable.

/** Store with a `todos` collection and two seeded rows. */
function setup(options: Partial<VueStackOptions> = {}) {
  return createVueStack({
    schema: [{ name: 'todos' }],
    data: {
      todos: [
        { id: '1', title: 'One' },
        { id: '2', title: 'Two' },
      ],
    },
    ...options,
  })
}

describe('cache-first', () => {
  it('fetches once, then serves the second query from cache', async () => {
    const { store, run, remote } = await setup()

    await run(() => store.todos.query((q: any) => q.many({ fetchPolicy: 'cache-first' })))
    const second = await run(() => store.todos.query((q: any) => q.many({ fetchPolicy: 'cache-first' })))

    expect(remote.callCount('fetchMany')).toBe(1)
    expect(second.data.value).toHaveLength(2)
  })
})

describe('cache-and-fetch', () => {
  it('serves the cache and revalidates in the background', async () => {
    const { store, run, remote } = await setup()
    await run(() => store.todos.query((q: any) => q.many()))
    remote.seed('todos', [
      { id: '1', title: 'Fresh' },
      { id: '2', title: 'Two' },
    ])

    const query = await run(() => store.todos.query((q: any) => q.many({ fetchPolicy: 'cache-and-fetch' })))

    // Cached data is displayed right away, so the query never blocks.
    expect(query.loading.value).toBe(false)
    expect(query.data.value).toHaveLength(2)

    await query.background.promise
    expect(remote.callCount('fetchMany')).toBe(2)
    expect(query.background.completed.value).toBe(true)
    expect(query.data.value.find((todo: any) => todo.id === '1').title).toBe('Fresh')
  })

  it('reports a failed background refresh without dropping the displayed data', async () => {
    const { store, run, remote } = await setup()
    await run(() => store.todos.query((q: any) => q.many()))
    const error = new Error('offline')
    remote.failNext('fetchMany', error)

    const query = await run(() => store.todos.query((q: any) => q.many({ fetchPolicy: 'cache-and-fetch' })))
    await query.background.promise

    expect(query.background.error.value).toBe(error)
    expect(query.data.value).toHaveLength(2)
  })
})

describe('fetch-only', () => {
  it('fetches every time and still writes to the cache', async () => {
    const { store, remote } = await setup()

    await store.todos.findMany({ fetchPolicy: 'fetch-only' })
    await store.todos.findMany({ fetchPolicy: 'fetch-only' })

    expect(remote.callCount('fetchMany')).toBe(2)
    expect(store.todos.peekMany()).toHaveLength(2)
  })
})

describe('cache-only', () => {
  it('never reaches the backend', async () => {
    const { store, remote } = await setup()

    const empty = await store.todos.findMany({ fetchPolicy: 'cache-only' })

    expect(empty).toHaveLength(0)
    expect(remote.callCount('fetchMany')).toBe(0)
  })

  it('serves items fetched under another fetch policy', async () => {
    const { store, remote } = await setup()
    await store.todos.findMany({ fetchPolicy: 'cache-first' })

    const cached = await store.todos.findMany({ fetchPolicy: 'cache-only' })

    // The marker excludes `fetchPolicy`, so a cache-only read sees what any
    // other policy already fetched instead of reporting an empty result.
    expect(cached).toHaveLength(2)
    expect(store.todos.peekMany()).toHaveLength(2)
    expect(remote.callCount('fetchMany')).toBe(1)
  })
})

describe('no-cache', () => {
  describe.each(['first', 'many'] as const)('%s reactive query', (method) => {
    it.each(['explicit', 'default', 'hook'] as const)('retains response values with policy from %s', async (source) => {
      const { store, run, remote } = await setup({
        findDefaults: source === 'default' ? { fetchPolicy: 'no-cache' } : undefined,
        plugins: source === 'hook'
          ? [{
              name: 'no-cache-policy',
              setup({ hook }) {
                hook('resolveFindOptions', ({ updateFindOptions }) => {
                  updateFindOptions({ fetchPolicy: 'no-cache' })
                })
              },
            }]
          : [],
      })
      const query = await run(() => store.todos.query((q: any) => q[method]({
        key: method === 'first' ? '1' : undefined,
        pageSize: 1,
        resultMode: 'responseRefs',
        ...(source === 'explicit' ? { fetchPolicy: 'no-cache' } : {}),
      })))
      /** The first visible title through either query shape. */
      const title = () => (method === 'first' ? query.data.value : query.data.value[0])?.title
      expect(title()).toBe('One')
      expect(remote.callCount(method === 'first' ? 'fetchFirst' : 'fetchMany')).toBe(1)
      expect(store.todos.peekMany()).toEqual([])

      remote.seed('todos', [{ id: '1', title: 'Fresh' }, { id: '2', title: 'Two' }])
      await query.refresh()
      expect(title()).toBe('Fresh')
      expect(query.error.value).toBeNull()
      if (method === 'many') {
        await query.fetchMore({ pageIndex: 1 })
        expect(query.data.value.map((item: any) => item.title)).toEqual(['Fresh', 'Two'])
      }
      expect(store.todos.peekMany()).toEqual([])
    })
  })

  it('fetches without populating the cache', async () => {
    const { store, remote } = await setup()

    const result = await store.todos.findMany({ fetchPolicy: 'no-cache' })

    expect(result).toHaveLength(2)
    expect(remote.callCount('fetchMany')).toBe(1)
    expect(store.todos.peekMany()).toHaveLength(0)
  })
})

describe('foreground state', () => {
  it('tracks a blocking refresh from start to finish', async () => {
    const { store, run, remote } = await setup()
    const query = await run(() => store.todos.query((q: any) => q.many()))

    const release = remote.holdNext('fetchMany')
    const refreshing = query.refresh()
    await vi.waitFor(() => expect(query.foreground.loading.value).toBe(true))

    release()
    await refreshing
    expect(query.foreground.loading.value).toBe(false)
    expect(query.foreground.lastUpdated.value).toBeTypeOf('number')
  })
})
