import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { cached, createGarbageCollectionStack, drainGarbageCollection, queryIds, todoSchema } from './utils'

describe('page ownership', () => {
  it('releases a row removed from a non-main page', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    const fetches = stack.remote.callCount('fetchMany', 'todos')
    expect(queryIds(query)).toEqual(['1', '2'])

    stack.remote.seed('todos', [{ id: '1' }])
    await query.refresh({ pages: [1] })
    await drainGarbageCollection()

    expect(query.pages.value[1]?.data).toEqual([])
    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '2')).toBeUndefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })

  it('keeps a shared row when a different page still owns its cache identity', async () => {
    let secondPageOwnsRow = true
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      on: {
        fetchMany: ({ findOptions }) => {
          if (findOptions.pageIndex === 1) {
            return secondPageOwnsRow ? [{ id: '1' }] : []
          }
          return [{ id: '1' }]
        },
      },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    const fetches = stack.remote.callCount('fetchMany', 'todos')

    secondPageOwnsRow = false
    await query.refresh({ pages: [1] })
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['1'])
    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })

  it('keeps an omitted page owned when refreshing only page zero', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    const fetches = stack.remote.callCount('fetchMany', 'todos')

    await query.refresh({ pages: [0] })
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['1'])
    expect(query.pages.value[1]?.data.map((item: any) => item.id)).toEqual(['2'])
    expect(queryIds(query)).toEqual(['1', '2'])
    expect(cached(stack, 'todos', '2')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })

  it('releases unique rows absent from every loaded-page replacement', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    const fetches = stack.remote.callCount('fetchMany', 'todos')
    stack.remote.seed('todos', [{ id: '1' }])

    await query.refresh()
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['1'])
    expect(query.pages.value[1]?.data).toEqual([])
    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '2')).toBeUndefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 2)
  })

  it('releases discarded extra-page ownership after query options change', async () => {
    const search = ref('old')
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      on: {
        fetchMany: ({ findOptions }) => findOptions.params.search === 'old'
          ? (findOptions.pageIndex === 1 ? [{ id: '2' }] : [{ id: '1' }])
          : [{ id: '3' }],
      },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      params: { search: search.value },
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    const fetches = stack.remote.callCount('fetchMany', 'todos')

    search.value = 'new'
    await vi.waitFor(() => expect(queryIds(query)).toEqual(['3']))
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['3'])
    expect(query.pages.value[1]).toBeUndefined()
    expect(cached(stack, 'todos', '1')).toBeUndefined()
    expect(cached(stack, 'todos', '2')).toBeUndefined()
    expect(cached(stack, 'todos', '3')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })

  it('releases an old main-page id when its reactive index changes', async () => {
    const pageIndex = ref(0)
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      on: { fetchMany: ({ findOptions }) => [{ id: `page-${findOptions.pageIndex ?? 0}` }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageIndex: pageIndex.value,
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    const fetches = stack.remote.callCount('fetchMany', 'todos')

    pageIndex.value = 1
    await vi.waitFor(() => expect(queryIds(query)).toEqual(['page-1']))
    await drainGarbageCollection()

    expect(query.pages.value[0]).toBeUndefined()
    expect(query.pages.value[1]?.data.map((item: any) => item.id)).toEqual(['page-1'])
    expect(cached(stack, 'todos', 'page-0')).toBeUndefined()
    expect(cached(stack, 'todos', 'page-1')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })

  it.each(['computed', 'responseRefs'])('releases the same page ownership in %s mode', async (resultMode) => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode,
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    const fetches = stack.remote.callCount('fetchMany', 'todos')
    stack.remote.seed('todos', [{ id: '1' }])

    await query.refresh({ pages: [1] })
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['1'])
    expect(query.pages.value[1]?.data).toEqual([])
    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '2')).toBeUndefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })

  it('adopts a cache-and-fetch page before its held background lane settles', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const first = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await first.result
    const fetches = stack.remote.callCount('fetchMany', 'todos')
    const release = stack.remote.holdNext('fetchMany')
    const remount = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      fetchPolicy: 'cache-and-fetch',
      experimentalGarbageCollection: true,
    })))
    const query = await remount.result
    first.stop()
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['1'])
    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
    release()
  })

  it('keeps a failed non-main refresh from releasing its current page ownership', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    const fetches = stack.remote.callCount('fetchMany', 'todos')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    stack.remote.failNext('fetchMany')

    await query.refresh({ pages: [1] })
    error.mockRestore()
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['1'])
    expect(query.pages.value[1]?.data.map((item: any) => item.id)).toEqual(['2'])
    expect(queryIds(query)).toEqual(['1', '2'])
    expect(cached(stack, 'todos', '2')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })

  it('ignores a superseded non-main response and collects its unowned stale row', async () => {
    let mode: 'initial' | 'stale' | 'current' = 'initial'
    let releaseStale: (() => void) | undefined
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      on: {
        fetchMany: ({ findOptions }) => {
          const page = findOptions.pageIndex ?? 0
          if (page === 0)
            return [{ id: '1' }]
          if (mode === 'stale') {
            return new Promise((resolve) => {
              releaseStale = () => {
                resolve([{ id: '3' }])
              }
            })
          }
          return [{ id: mode === 'initial' ? '2' : '2' }]
        },
      },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      dedupe: false,
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })
    mode = 'stale'
    const stale = query.refresh({ pages: [1] })
    await vi.waitFor(() => expect(releaseStale).toBeTypeOf('function'))
    mode = 'current'

    await query.refresh({ pages: [1] })
    releaseStale!()
    await stale
    await drainGarbageCollection()

    expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['1'])
    expect(query.pages.value[1]?.data.map((item: any) => item.id)).toEqual(['2'])
    expect(queryIds(query)).toEqual(['1', '2'])
    expect(cached(stack, 'todos', '2')).toBeDefined()
    expect(cached(stack, 'todos', '3')).toBeUndefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(4)
  })
})
