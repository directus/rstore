import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { harnessSchema, harnessTodos } from './shared'

describe('fake remote handlers', () => {
  it('answers seeded rows with no handler', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: harnessTodos() })
    const rows = await store.todos.findMany({ fetchPolicy: 'fetch-only' })
    expect(rows.map((todo: any) => todo.title)).toEqual(['One', 'Two'])
    expect(remote.callCount('fetchMany', 'todos')).toBe(1)
  })

  it('replaces one default handler', async () => {
    const { store, remote } = await createVueStack({
      schema: harnessSchema,
      data: { todos: [{ id: '1', title: 'One' }] },
      on: { updateItem: ctx => ctx.rows().find(row => ctx.getKey(row) === ctx.key) },
    })
    await store.todos.update({ id: '1', title: 'Renamed' })
    expect(store.todos.peekFirst('1').title).toBe('One')
    expect(remote.rows('todos')).toEqual([{ id: '1', title: 'One' }])
    expect(remote.lastRequest('updateItem')!.item).toEqual({ id: '1', title: 'Renamed' })
  })

  it('memoizes ctx.next inside a handler', async () => {
    const calls: boolean[] = []
    const { store, remote } = await createVueStack({
      schema: harnessSchema,
      data: { todos: [{ id: '1', title: 'One', archived: false }, { id: '2', title: 'Two', archived: true }] },
      on: {
        fetchMany: async (ctx) => {
          const rows = await ctx.next()
          calls.push(rows === await ctx.next())
          return rows.filter((row: any) => !row.archived)
        },
      },
    })
    const rows = await store.todos.findMany({ fetchPolicy: 'fetch-only' })
    expect(rows.map((todo: any) => todo.id)).toEqual(['1'])
    expect(calls).toEqual([true])
    expect(remote.callCount('fetchMany', 'todos')).toBe(1)
  })

  it('gives respondNext priority over a handler', async () => {
    const { store, remote } = await createVueStack({
      schema: harnessSchema,
      data: { todos: [] },
      on: { createItem: ctx => ({ ...ctx.item, source: 'handler' }) },
    })
    remote.respondNext('createItem', item => ({ ...item, source: 'responder' }))
    expect((await store.todos.create({ id: '1', title: 'One' })).source).toBe('responder')
    expect((await store.todos.create({ id: '2', title: 'Two' })).source).toBe('handler')
  })

  it('installs and removes a handler during a test', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: { todos: [{ id: '1', title: 'One' }] } })
    remote.on('fetchMany', ctx => ctx.rows().map(row => ({ ...row, title: 'From handler' })))
    expect((await store.todos.findMany({ fetchPolicy: 'fetch-only' })).map((todo: any) => todo.title)).toEqual(['From handler'])
    remote.on('fetchMany', null)
    expect((await store.todos.findMany({ fetchPolicy: 'fetch-only' })).map((todo: any) => todo.title)).toEqual(['One'])
  })
})

describe('fake remote keys and batches', () => {
  it('uses each collection key field', async () => {
    const { store, remote } = await createVueStack({
      schema: [{ name: 'articles', getKey: (item: any) => item.uuid }, { name: 'todos' }],
      keys: { articles: 'uuid' },
      data: { articles: [{ uuid: 'a1', title: 'One' }], todos: [{ id: '1', title: 'Todo' }] },
    })
    await store.articles.update({ uuid: 'a1', title: 'Renamed' })
    await store.todos.update({ id: '1', title: 'Renamed too' })
    expect(remote.rows('articles')).toEqual([{ uuid: 'a1', title: 'Renamed' }])
    expect(remote.rows('todos')).toEqual([{ id: '1', title: 'Renamed too' }])
    expect(remote.getKey('articles', { uuid: 'a1' })).toBe('a1')
  })

  it('answers a batched fetch and mutation', async () => {
    const { store, remote } = await createVueStack({
      schema: harnessSchema,
      data: { todos: [{ id: '1', title: 'One' }] },
      batch: true,
      batching: true,
    })
    const [fetched] = await Promise.all([
      store.todos.findFirst({ key: '1', fetchPolicy: 'fetch-only' }),
      store.todos.create({ id: '2', title: 'Two' }),
    ])
    expect(fetched.title).toBe('One')
    expect(remote.callCount('batchFetch', 'todos')).toBe(1)
    expect(remote.callCount('batchMutate', 'todos')).toBe(1)
    expect(remote.lastRequest('batchMutate')!.mutation).toBe('create')
    expect(remote.callCount('createItem')).toBe(0)
  })

  it('fails a complete batch through failNext', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: { todos: [] }, batch: true, batching: true })
    remote.failNext('batchMutate')
    await expect(store.todos.create({ id: '1', title: 'One' })).rejects.toThrow('fake-remote: batchMutate failed')
    expect(remote.rows('todos')).toEqual([])
  })
})

describe('fake remote call scripting', () => {
  it('holds several hook calls on one gate', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: harnessTodos() })
    const release = remote.holdNext('fetchMany', { count: 2 })
    const settled: string[] = []
    const pages = [
      store.todos.findMany({ params: { limit: 1 }, fetchPolicy: 'fetch-only' }).then(() => settled.push('a')),
      store.todos.findMany({ params: { limit: 2 }, fetchPolicy: 'fetch-only' }).then(() => settled.push('b')),
    ]
    await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(2))
    expect(settled).toEqual([])
    release()
    await Promise.all(pages)
    expect(settled).toHaveLength(2)
  })

  it('orders a delayed hook after a normal hook', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: harnessTodos() })
    remote.latency('fetchFirst', 40)
    const order: string[] = []
    await Promise.all([
      store.todos.findFirst({ key: '1', fetchPolicy: 'fetch-only' }).then(() => order.push('first')),
      store.todos.findMany({ fetchPolicy: 'fetch-only' }).then(() => order.push('many')),
    ])
    expect(order).toEqual(['many', 'first'])
  })

  it('uses a one-shot scripted response', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: harnessTodos() })
    remote.respondNext('createItem', item => ({ ...item, id: 'server-assigned' }))
    expect((await store.todos.create({ title: 'Three' })).id).toBe('server-assigned')
    expect(remote.rows('todos').map(row => row.id)).toContain('server-assigned')
    expect((await store.todos.create({ id: '4', title: 'Four' })).id).toBe('4')
  })

  it('records resolved find options', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: harnessTodos() })
    await store.todos.findMany({ params: { where: { done: false } }, fetchPolicy: 'fetch-only' })
    const request = remote.lastRequest('fetchMany', 'todos')!
    expect(request.findOptions.params).toEqual({ where: { done: false } })
    expect(request.findOptions.fetchPolicy).toBe('fetch-only')
    expect(request.findOptions.fetchOptions).toBeDefined()
  })

  it('fails a scripted subscription', async () => {
    const { store, run, remote } = await createVueStack({ schema: harnessSchema, data: { todos: [] } })
    remote.failNext('subscribe')
    await run(() => store.todos.liveQuery((q: any) => q.many()))
    await vi.waitFor(() => expect(remote.callCount('subscribe')).toBe(1))
    expect(remote.subscriptions()).toEqual([])
  })
})
