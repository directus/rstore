// Integration coverage of Monospace relations with a real rstore Vue store
// and mocked REST client. This file is excluded from `tsc --noEmit` (see
// tsconfig.json) because the @rstore/vue sources only type-check in their
// own package context; vitest still runs it.
import { describe, expect, it } from 'vitest'
import { createMonospaceTestStore as createTestStore } from './utils/store'

describe('monospace relations with a real rstore store', () => {
  it('resolves included to-one relations through the real FK column join', async () => {
    const { storePromise, readManyMock } = createTestStore(async (collection) => {
      if (collection === 'Todos') {
        return [{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }]
      }
      return []
    })
    const store: any = await storePromise

    const todos = await store.Todos.findMany({ include: { author: true } })

    expect(readManyMock).toHaveBeenCalledTimes(1)
    expect(readManyMock).toHaveBeenCalledWith('Todos', { fields: ['*'], include: { author: { fields: ['*'] } } })
    expect(todos).toHaveLength(1)
    // The accessor joins `Todos.author_id` to the cached Profiles item.
    expect(todos[0].author?.name).toBe('Jane')
    // The related Profile is normalized into its own collection.
    const profiles = store.$cache.readItems({ collection: store.$collections.find((c: any) => c.name === 'Profiles') })
    expect(profiles).toHaveLength(1)
  })

  it('appends the FK column to explicit field selections with include', async () => {
    const { storePromise, readManyMock } = createTestStore(async (collection) => {
      if (collection === 'Todos') {
        return [{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }]
      }
      return []
    })
    const store: any = await storePromise

    const todos = await store.Todos.findMany({ fields: ['id', 'title'], include: { author: true } })

    expect(readManyMock).toHaveBeenCalledWith('Todos', { fields: ['id', 'title', 'author_id'], include: { author: { fields: ['*'] } } })
    expect(todos[0].author?.name).toBe('Jane')
  })

  it('resolves included to-many relations through the target FK columns', async () => {
    const { storePromise, readManyMock } = createTestStore(async (collection) => {
      if (collection === 'Profiles') {
        return [{
          id: 'p1',
          name: 'Jane',
          todos: { data: [{ id: 1, title: 'A', author_id: 'p1' }, { id: 2, title: 'B', author_id: 'p1' }] },
        }]
      }
      return []
    })
    const store: any = await storePromise

    const profiles = await store.Profiles.findMany({ include: { todos: true } })

    expect(readManyMock).toHaveBeenCalledWith('Profiles', { fields: ['*'], include: { todos: { fields: ['*'], limit: -1 } } })
    expect(profiles).toHaveLength(1)
    expect(profiles[0].todos.map((todo: any) => todo.title).sort()).toEqual(['A', 'B'])
  })

  it('serves cache results without a refetch when the FK join already resolves', async () => {
    const { storePromise, readManyMock } = createTestStore(async (collection) => {
      if (collection === 'Todos') {
        return [{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }]
      }
      return []
    })
    const store: any = await storePromise

    // First run fetches with embedded relations and seeds the cache with
    // both the FK column and the related Profiles item.
    await store.Todos.findMany({ include: { author: true } })
    expect(readManyMock).toHaveBeenCalledTimes(1)

    // Second run is served from the cache; the to-one relation resolves
    // through `author_id`, so no follow-up fetch is issued.
    const todos = await store.Todos.findMany({ include: { author: true } })
    expect(readManyMock).toHaveBeenCalledTimes(1)
    expect(todos[0].author?.name).toBe('Jane')
  })

  it('recovers every missing FK target without refetching satisfied or null relations', async () => {
    const { storePromise, readManyMock } = createTestStore(async (collection, query) => {
      if (collection === 'Todos') {
        const items = [
          { id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } },
          { id: 2, title: 'B', author_id: 'p2', author: { id: 'p2', name: 'John' } },
          { id: 3, title: 'C', author_id: null, author: null },
          { id: 4, title: 'D', author_id: 'p4', author: { id: 'p4', name: 'Jo' } },
        ]
        // Simulated REST selection makes incomplete recovery observable:
        // omitted IDs cannot be rescued by a canned full-batch response.
        return query.filter ? items.filter(item => query.filter.id._in.includes(item.id)) : items
      }
      return []
    })
    const store: any = await storePromise

    await store.Todos.findMany({ include: { author: true } })
    expect(readManyMock).toHaveBeenCalledTimes(1)

    // Leave p2 cached and a null FK in place; only IDs 1 and 4 need recovery.
    const profilesCollection = store.$collections.find((c: any) => c.name === 'Profiles')
    store.$cache.deleteItem({ collection: profilesCollection, key: 'p1' })
    store.$cache.deleteItem({ collection: profilesCollection, key: 'p4' })

    // The cache-served result triggers one fetch-only re-fetch that embeds
    // the missing relation again.
    const todos = await store.Todos.findMany({ include: { author: true } })
    expect(readManyMock).toHaveBeenCalledTimes(2)
    expect(todos.map((todo: any) => ({
      id: todo.id,
      title: todo.title,
      author_id: todo.author_id,
      author: todo.author ? { id: todo.author.id, name: todo.author.name } : null,
    }))).toEqual([
      { id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } },
      { id: 2, title: 'B', author_id: 'p2', author: { id: 'p2', name: 'John' } },
      { id: 3, title: 'C', author_id: null, author: null },
      { id: 4, title: 'D', author_id: 'p4', author: { id: 'p4', name: 'Jo' } },
    ])
    expect(readManyMock).toHaveBeenLastCalledWith('Todos', {
      fields: ['*'],
      filter: { id: { _in: expect.arrayContaining([1, 4]) } },
      include: { author: { fields: ['*'] } },
    })
    expect(readManyMock.mock.lastCall![1].filter.id._in).toHaveLength(2)
    const profiles = store.$cache.readItems({ collection: profilesCollection })
    expect(profiles.map((profile: any) => ({ id: profile.id, name: profile.name })).sort((a: any, b: any) => a.id.localeCompare(b.id))).toEqual([
      { id: 'p1', name: 'Jane' },
      { id: 'p2', name: 'John' },
      { id: 'p4', name: 'Jo' },
    ])
    expect(readManyMock).toHaveBeenCalledTimes(2)
  })

  it('serializes create-form $connect into a to-one _connect operation', async () => {
    const { storePromise, client } = createTestStore(async (collection) => {
      if (collection === 'Profiles') {
        return [{ id: 'p1', name: 'Jane' }]
      }
      return []
    })
    const store: any = await storePromise
    await store.Profiles.findMany({})

    const form = store.Todos.createForm()
    form.title = 'A'
    form.author.$connect({ id: 'p1' })
    client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: 'p1' })

    await form.$submit()

    // $connect writes the real `author_id` FK column onto the form, but
    // Monospace create inputs only accept the relation `_connect` operation.
    expect(client.createOne).toHaveBeenCalledWith('Todos', {
      title: 'A',
      author: { _connect: { key: { id: 'p1' } } },
    }, { fields: ['*'] })

    // The created item resolves its relation accessor from the cache.
    const todosCollection = store.$collections.find((c: any) => c.name === 'Todos')
    const created: any = store.$cache.readItem({ collection: todosCollection, key: 5 })
    expect(created?.author?.name).toBe('Jane')
  })

  it('serializes update-form to-one $disconnect into a null FK column write', async () => {
    const { storePromise, client } = createTestStore(async (collection) => {
      if (collection === 'Todos') {
        return [{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }]
      }
      return []
    })
    const store: any = await storePromise
    await store.Todos.findMany({ include: { author: true } })

    const form = await store.Todos.updateForm({ key: 1 })
    form.author.$disconnect()
    client.updateOne.mockResolvedValueOnce({ id: 1, title: 'A', author_id: null })

    await form.$submit()

    expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, {
      author_id: null,
    }, { fields: ['*'] })

    // The updated FK column clears the accessor without a refetch.
    const todosCollection = store.$collections.find((c: any) => c.name === 'Todos')
    const updated: any = store.$cache.readItem({ collection: todosCollection, key: 1 })
    expect(updated?.author).toBeUndefined()
  })

  it('serializes update-form to-many operations and reconciles the cache', async () => {
    const { storePromise, client } = createTestStore(async (collection) => {
      if (collection === 'Profiles') {
        return [{ id: 'p1', name: 'Jane', todos: { data: [{ id: 1, title: 'A', author_id: 'p1' }] } }]
      }
      if (collection === 'Todos') {
        return [{ id: 2, title: 'B', author_id: null }]
      }
      return []
    })
    const store: any = await storePromise
    await store.Profiles.findMany({ include: { todos: true } })
    await store.Todos.findMany({})

    const form = await store.Profiles.updateForm({ key: 'p1' })
    form.todos.$connect({ id: 2 })
    client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

    await form.$submit()

    // Update mode sends to-many relation operations as an array.
    expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
      todos: [{ _connect: { keys: [{ id: 2 }] } }],
    }, { fields: ['*'] })

    // The connected todo's real FK column is patched in the cache so the
    // relation accessor resolves without a refetch.
    const profilesCollection = store.$collections.find((c: any) => c.name === 'Profiles')
    const profile: any = store.$cache.readItem({ collection: profilesCollection, key: 'p1' })
    expect(profile.todos.map((todo: any) => todo.id).sort()).toEqual([1, 2])

    const todosCollection = store.$collections.find((c: any) => c.name === 'Todos')
    const connected: any = store.$cache.readItem({ collection: todosCollection, key: 2 })
    expect(connected?.author_id).toBe('p1')
  })

  it('serializes update-form to-many $set into disconnects and connects', async () => {
    const { storePromise, client } = createTestStore(async (collection) => {
      if (collection === 'Profiles') {
        return [{
          id: 'p1',
          name: 'Jane',
          todos: { data: [{ id: 1, title: 'A', author_id: 'p1' }, { id: 2, title: 'B', author_id: 'p1' }] },
        }]
      }
      if (collection === 'Todos') {
        return [{ id: 3, title: 'C', author_id: null }]
      }
      return []
    })
    const store: any = await storePromise
    await store.Profiles.findMany({ include: { todos: true } })
    await store.Todos.findMany({})

    const form = await store.Profiles.updateForm({ key: 'p1' })
    form.todos.$set([{ id: 2 }, { id: 3 }])
    client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

    await form.$submit()

    // $set is decomposed against the cached FK columns: todo 1 is
    // disconnected, todo 3 is connected, todo 2 stays untouched.
    expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
      todos: [
        { _disconnect: { filter: { id: 1 } } },
        { _connect: { keys: [{ id: 3 }] } },
      ],
    }, { fields: ['*'] })

    const profilesCollection = store.$collections.find((c: any) => c.name === 'Profiles')
    const profile: any = store.$cache.readItem({ collection: profilesCollection, key: 'p1' })
    expect(profile.todos.map((todo: any) => todo.id).sort()).toEqual([2, 3])
  })
})
