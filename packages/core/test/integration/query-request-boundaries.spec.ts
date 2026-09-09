import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst, findMany } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

describe('query request boundaries', () => {
  it('shares cache-only results with shared or separate metadata without fetching', async () => {
    const stack = await createCoreStack({ schema: [{ name: 'todos' }], data: { todos: [{ id: '1' }] } })
    const collection = stack.collection('todos')
    await findMany({ store: stack.store, collection })
    const firstMeta = { source: 'cached' }
    const secondMeta = { source: 'other' }
    const options = { store: stack.store, collection, findOptions: { fetchPolicy: 'cache-only' as const } }

    const results = await Promise.all([
      findMany({ ...options, meta: firstMeta as any }),
      findMany({ ...options, meta: firstMeta as any }),
      findMany({ ...options, meta: secondMeta as any }),
    ])

    expect(results.map(({ result }) => result.map(item => item.id))).toEqual([['1'], ['1'], ['1']])
    expect(firstMeta.source).toBe('cached')
    expect(secondMeta.source).toBe('cached')
    expect(stack.remote.callCount('fetchMany')).toBe(1)
  })

  it.each(['fetch-only', 'cache-and-fetch'] as const)('shares metadata after a deduped %s fetch settles', async (fetchPolicy) => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1' }] },
      on: { fetchMany: async (ctx) => {
        ctx.payload.meta.total = 42
        return ctx.next()
      } },
    })
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    const firstMeta = { total: 0 }
    const secondMeta = { total: 0 }
    const options = { store: stack.store, collection: stack.collection('todos'), findOptions: { fetchPolicy } }
    const first = findMany({ ...options, meta: firstMeta as any })
    const second = findMany({ ...options, meta: secondMeta as any })
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(1))
    release()
    const results = await Promise.all([first, second])
    await Promise.all(results.map(result => result.fetchPromise))

    expect(stack.remote.callCount('fetchMany')).toBe(1)
    expect(firstMeta.total).toBe(42)
    expect(secondMeta.total).toBe(42)
    expect(stack.read('todos', '1')?.id).toBe('1')
  })

  it('shares one in-flight request between identical findFirst calls', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const release = stack.remote.holdNext('fetchFirst')
    const collection = stack.collection('todos')
    const first = findFirst({ store: stack.store, collection, findOptions: '1' })
    const second = findFirst({ store: stack.store, collection, findOptions: '1' })

    await vi.waitFor(() => expect(stack.remote.callCount('fetchFirst', 'todos')).toBe(1))
    release()

    const results = await Promise.all([first, second])
    expect(results.map(({ result }) => result?.title)).toEqual(['One', 'One'])
  })

  it('does not share findMany requests when dedupe is disabled', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const collection = stack.collection('todos')

    const results = await Promise.all([
      findMany({ store: stack.store, collection, findOptions: { dedupe: false, fetchPolicy: 'fetch-only' } }),
      findMany({ store: stack.store, collection, findOptions: { dedupe: false, fetchPolicy: 'fetch-only' } }),
    ])

    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(2)
    expect(results.map(({ result }) => result.map(item => item.title))).toEqual([['One'], ['One']])
  })

  it('does not share findFirst requests when dedupe is disabled', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const collection = stack.collection('todos')

    const results = await Promise.all([
      findFirst({ store: stack.store, collection, findOptions: { key: '1', dedupe: false, fetchPolicy: 'fetch-only' } }),
      findFirst({ store: stack.store, collection, findOptions: { key: '1', dedupe: false, fetchPolicy: 'fetch-only' } }),
    ])

    expect(stack.remote.callCount('fetchFirst', 'todos')).toBe(2)
    expect(results.map(({ result }) => result?.title)).toEqual(['One', 'One'])
  })

  it('keeps different collections and keys in separate findFirst requests', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }, { name: 'notes' }],
      data: {
        todos: [{ id: '1', title: 'Todo' }, { id: '2', title: 'Second' }],
        notes: [{ id: '1', title: 'Note' }],
      },
    })

    const results = await Promise.all([
      findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
      findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: '2', fetchPolicy: 'fetch-only' } }),
      findFirst({ store: stack.store, collection: stack.collection('notes'), findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
    ])

    expect(stack.remote.callCount('fetchFirst')).toBe(3)
    expect(results.map(({ result }) => result?.title)).toEqual(['Todo', 'Second', 'Note'])
  })

  it.each(['findFirst', 'findMany'] as const)('shares %s requests using the same filter function reference', async (method) => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const release = stack.remote.holdNext(method === 'findFirst' ? 'fetchFirst' : 'fetchMany')
    const collection = stack.collection('todos')
    const filter = (item: any) => item.id === '1'
    const request = () => method === 'findFirst'
      ? findFirst({ store: stack.store, collection, findOptions: { filter, fetchPolicy: 'fetch-only' } })
      : findMany({ store: stack.store, collection, findOptions: { filter, fetchPolicy: 'fetch-only' } })

    const pending = [request(), request()]
    await vi.waitFor(() => expect(stack.remote.callCount(method === 'findFirst' ? 'fetchFirst' : 'fetchMany')).toBe(1))
    release()
    await Promise.all(pending)
  })

  it.each(['findFirst', 'findMany'] as const)('separates %s requests using different filter function references', async (method) => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const collection = stack.collection('todos')
    const request = (filter: (item: any) => boolean) => method === 'findFirst'
      ? findFirst({ store: stack.store, collection, findOptions: { filter, fetchPolicy: 'fetch-only' } })
      : findMany({ store: stack.store, collection, findOptions: { filter, fetchPolicy: 'fetch-only' } })

    await Promise.all([
      request(item => item.id === '1'),
      request(item => item.id === '1'),
    ])

    expect(stack.remote.callCount(method === 'findFirst' ? 'fetchFirst' : 'fetchMany')).toBe(2)
  })

  it.each(['findFirst', 'findMany'] as const)('separates %s requests with different structural options', async (method) => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const collection = stack.collection('todos')
    const request = (pageSize: number) => method === 'findFirst'
      ? findFirst({ store: stack.store, collection, findOptions: { key: '1', pageSize, fetchPolicy: 'fetch-only' } })
      : findMany({ store: stack.store, collection, findOptions: { pageSize, fetchPolicy: 'fetch-only' } })

    await Promise.all([request(1), request(2)])

    expect(stack.remote.callCount(method === 'findFirst' ? 'fetchFirst' : 'fetchMany')).toBe(2)
  })

  it.each(['fetchFirst', 'fetchMany'] as const)('rejects keyless %s results without caching them', async (hook) => {
    const stack = await createCoreStack({ schema: [{ name: 'todos' }] })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stack.remote.respondNext(hook, () => hook === 'fetchFirst' ? { title: 'Keyless' } : [{ title: 'Keyless' }])

    const request = hook === 'fetchFirst'
      ? findFirst({
          store: stack.store,
          collection: stack.collection('todos'),
          findOptions: { key: 'missing', fetchPolicy: 'fetch-only' },
        })
      : findMany({
          store: stack.store,
          collection: stack.collection('todos'),
          findOptions: { fetchPolicy: 'fetch-only' },
        })

    try {
      await expect(request).rejects.toThrow('Item does not have a key for collection todos')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Key is undefined'))
      expect(stack.readMany('todos')).toEqual([])
    }
    finally {
      warn.mockRestore()
    }
  })
})
