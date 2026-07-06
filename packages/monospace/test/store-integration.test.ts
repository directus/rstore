// End-to-end coverage of the Monospace relations design against a real
// rstore Vue store. This file is excluded from `tsc --noEmit` (see
// tsconfig.json) because the @rstore/vue sources only type-check in their
// own package context; vitest still runs it.
import { describe, expect, it, vi } from 'vitest'
import { createStore } from '../../vue/src/store'
import { createMonospaceRstorePlugin } from '../src'

/**
 * Creates a real rstore Vue store wired to the Monospace plugin with a
 * mocked REST client, mirroring the generated collection shapes: relations
 * join on the real `author_id` FK column.
 */
function createTestStore(readMany: (collection: string, query: any) => Promise<any[]>) {
  const readManyMock = vi.fn(readMany)
  const client: any = {
    readMany: readManyMock,
    readOne: vi.fn(),
    createOne: vi.fn(),
    createMany: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
  }
  const storePromise = createStore({
    schema: [
      {
        name: 'Todos',
        scopeId: 'test-scope',
        meta: { primaryKeys: ['id'], monospace: { collection: 'Todos' } } as any,
        relations: { author: { to: { Profiles: { on: { id: 'author_id' } } } } },
        getKey: (item: any) => item.id,
      },
      {
        name: 'Profiles',
        scopeId: 'test-scope',
        meta: { primaryKeys: ['id'], monospace: { collection: 'Profiles' } } as any,
        relations: { todos: { many: true, to: { Todos: { on: { author_id: 'id' } } } } },
        getKey: (item: any) => item.id,
      },
    ],
    plugins: [createMonospaceRstorePlugin({ client, scopeId: 'test-scope' })],
  })
  return { storePromise, readManyMock, client }
}

describe('monospace relations end-to-end', () => {
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
    expect(readManyMock).toHaveBeenCalledWith('Todos', { fields: ['*', 'author.*'] })
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

    expect(readManyMock).toHaveBeenCalledWith('Todos', { fields: ['id', 'title', 'author_id', 'author.*'] })
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

    expect(readManyMock).toHaveBeenCalledWith('Profiles', { fields: ['*', 'todos.*'] })
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

  it('re-fetches cache-served items whose FK target is not cached', async () => {
    const { storePromise, readManyMock } = createTestStore(async (collection) => {
      if (collection === 'Todos') {
        return [{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }]
      }
      return []
    })
    const store: any = await storePromise

    await store.Todos.findMany({ include: { author: true } })
    expect(readManyMock).toHaveBeenCalledTimes(1)

    // Drop the related Profiles items so the FK column alone can no longer
    // resolve the accessor for cache-served results.
    const profilesCollection = store.$collections.find((c: any) => c.name === 'Profiles')
    store.$cache.clearCollection({ collection: profilesCollection })

    // The cache-served result triggers one fetch-only re-fetch that embeds
    // the missing relation again.
    const todos = await store.Todos.findMany({ include: { author: true } })
    expect(readManyMock).toHaveBeenCalledTimes(2)
    expect(readManyMock).toHaveBeenLastCalledWith('Todos', {
      fields: ['*', 'author.*'],
      filter: { id: { _in: [1] } },
    })
    expect(todos[0].author?.name).toBe('Jane')
  })

  it('serializes create-form $connect into a real FK column write', async () => {
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

    // $connect writes the real `author_id` FK column onto the form and the
    // create body carries it as a plain field — no `_connect` operation.
    expect(client.createOne).toHaveBeenCalledWith('Todos', {
      title: 'A',
      author_id: 'p1',
    }, {})

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
    }, {})

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
    }, {})

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
    }, {})

    const profilesCollection = store.$collections.find((c: any) => c.name === 'Profiles')
    const profile: any = store.$cache.readItem({ collection: profilesCollection, key: 'p1' })
    expect(profile.todos.map((todo: any) => todo.id).sort()).toEqual([2, 3])
  })
})
