import { describe, expect, it } from 'vitest'
import {
  fetchMissingMonospaceRelations,
  normalizeMonospaceRelationItems,
} from '../src'
import { createProfilesCollection, createTodosCollection } from './utils/plugin'
import { createMonospaceTestStore } from './utils/store'

describe('normalizeMonospaceRelationItems', () => {
  const context = { $collections: [createTodosCollection(), createProfilesCollection()] }

  it('keeps embedded to-one objects and FK columns untouched', () => {
    const item: any = { id: 1, author_id: 'p1', author: { id: 'p1', name: 'Jane' } }
    normalizeMonospaceRelationItems(context, createTodosCollection(), [item])

    expect(item).toEqual({ id: 1, author_id: 'p1', author: { id: 'p1', name: 'Jane' } })
  })

  it('unwraps to-many data envelopes', () => {
    const item: any = {
      id: 'p1',
      todos: {
        data: [{ id: 1, title: 'A', author_id: 'p1' }, { id: 2, title: 'B', author_id: 'p1' }],
      },
    }
    normalizeMonospaceRelationItems(context, createProfilesCollection(), [item])

    expect(item.todos).toEqual([
      { id: 1, title: 'A', author_id: 'p1' },
      { id: 2, title: 'B', author_id: 'p1' },
    ])
  })

  it('normalizes nested relation levels recursively', () => {
    const item: any = {
      id: 1,
      author: {
        id: 'p1',
        todos: {
          data: [{ id: 2 }],
        },
      },
    }
    normalizeMonospaceRelationItems(context, createTodosCollection(), [item])

    expect(item.author.todos).toEqual([{ id: 2 }])
  })

  it('tolerates circular payloads and missing metadata', () => {
    const todo: any = { id: 1 }
    const profile: any = { id: 'p1', todos: { data: [todo] } }
    todo.author = profile
    normalizeMonospaceRelationItems(context, createTodosCollection(), [todo])

    expect(Array.isArray(profile.todos)).toBe(true)
    expect(profile.todos[0]).toBe(todo)
    expect(() => normalizeMonospaceRelationItems(undefined, { name: 'Todos' } as any, [{ id: 1 }])).not.toThrow()
  })
})

describe('fetchMissingMonospaceRelations with real store/cache', () => {
  /** Seeds real cache and records only external REST reads. */
  async function createFetchingStore(cacheItems: Record<string, any[]> = {}) {
    const { storePromise, readManyMock } = createMonospaceTestStore(async (collection, query) => {
      if (collection === 'Todos') {
        const items = [
          { id: 1, author_id: 'p1', author: { id: 'p1', name: 'Jane' } },
          { id: 3, author_id: 'p3', author: { id: 'p3', name: 'Jo' } },
        ]
        return items.filter(item => query.filter.id._in.includes(item.id))
      }
      return [{ id: 'p1', todos: { data: [{ id: 1, author_id: 'p1' }] } }]
    })
    const store: any = await storePromise
    for (const [name, items] of Object.entries(cacheItems)) {
      const collection = store.$collections.find((entry: any) => entry.name === name)
      for (const item of items) {
        store.$cache.writeItem({ collection, key: item.id, item })
      }
    }
    const todos = store.$collections.find((entry: any) => entry.name === 'Todos')
    const profiles = store.$collections.find((entry: any) => entry.name === 'Profiles')
    return { store, readManyMock, todos, profiles }
  }

  it('re-fetches every unknown parent while skipping an embedded null relation', async () => {
    const { readManyMock, store, todos, profiles } = await createFetchingStore()
    await fetchMissingMonospaceRelations(store, todos, [
      { id: 1 },
      { id: 2, author: null },
      { id: 3 },
    ], { author: true })

    expect(readManyMock).toHaveBeenCalledExactlyOnceWith('Todos', {
      fields: ['*'],
      filter: { id: { _in: expect.arrayContaining([1, 3]) } },
      include: { author: { fields: ['*'] } },
    })
    expect([...readManyMock.mock.lastCall![1].filter.id._in].sort()).toEqual([1, 3])
    expect(store.$cache.readItems({ collection: profiles }).map((item: any) => ({ id: item.id, name: item.name }))).toEqual([
      { id: 'p1', name: 'Jane' },
      { id: 'p3', name: 'Jo' },
    ])
  })

  it('skips fetching when relations are already embedded', async () => {
    const { store, readManyMock, todos } = await createFetchingStore()
    await fetchMissingMonospaceRelations(store, todos, [
      { id: 1, author: { id: 'p1' } },
      { id: 2, author: null },
    ], { author: true })
    expect(readManyMock).not.toHaveBeenCalled()
  })

  it('skips fetching to-one relations with a null FK column', async () => {
    const { store, readManyMock, todos } = await createFetchingStore()
    await fetchMissingMonospaceRelations(store, todos, [{ id: 1, author_id: null }], { author: true })
    expect(readManyMock).not.toHaveBeenCalled()
  })

  it('skips fetching to-one relations resolvable through the real cache', async () => {
    const { store, readManyMock, todos } = await createFetchingStore({ Profiles: [{ id: 'p1', name: 'Jane' }] })
    await fetchMissingMonospaceRelations(store, todos, [{ id: 1, author_id: 'p1' }], { author: true })
    expect(readManyMock).not.toHaveBeenCalled()
  })

  it('re-fetches missing FK targets without losing already cached targets', async () => {
    const { readManyMock, store, todos, profiles } = await createFetchingStore({ Profiles: [{ id: 'p2', name: 'John' }] })
    await fetchMissingMonospaceRelations(store, todos, [{ id: 1, author_id: 'p1' }], { author: true })
    expect(readManyMock).toHaveBeenCalledExactlyOnceWith('Todos', {
      fields: ['*'],
      filter: { id: { _in: [1] } },
      include: { author: { fields: ['*'] } },
    })
    expect(store.$cache.readItem({ collection: profiles, key: 'p2' }).name).toBe('John')
    expect(store.$cache.readItem({ collection: todos, key: 1 }).author.name).toBe('Jane')
  })

  it('re-fetches absent to-many fields even when one matching child is cached', async () => {
    const { readManyMock, store, profiles } = await createFetchingStore({ Todos: [{ id: 1, author_id: 'p1' }] })
    await fetchMissingMonospaceRelations(store, profiles, [{ id: 'p1' }], { todos: true })
    expect(readManyMock).toHaveBeenCalledExactlyOnceWith('Profiles', {
      fields: ['*'],
      filter: { id: { _in: ['p1'] } },
      include: { todos: { fields: ['*'], limit: -1 } },
    })
    expect(store.$cache.readItem({ collection: profiles, key: 'p1' }).todos.map((item: any) => item.id)).toEqual([1])
  })

  it('checks raw relation presence through real wrapped cache items', async () => {
    const { readManyMock, store, todos } = await createFetchingStore({ Todos: [{ id: 1 }, { id: 2, author_id: null }] })
    const missing = store.$cache.readItem({ collection: todos, key: 1 })
    const embedded = store.$cache.readItem({ collection: todos, key: 2 })
    await fetchMissingMonospaceRelations(store, todos, [missing, embedded], { author: true })
    expect(readManyMock).toHaveBeenCalledExactlyOnceWith('Todos', {
      fields: ['*'],
      filter: { id: { _in: [1] } },
      include: { author: { fields: ['*'] } },
    })
    expect(store.$cache.readItem({ collection: todos, key: 1 }).author.name).toBe('Jane')
  })

  it('rejects unknown includes without requesting external data', async () => {
    const { store, readManyMock, todos } = await createFetchingStore()
    await expect(fetchMissingMonospaceRelations(store, todos, [{ id: 1 }], { unknown: true })).rejects.toThrow(
      'Relation "unknown" does not exist on collection "Todos"',
    )
    expect(readManyMock).not.toHaveBeenCalled()
  })
})
