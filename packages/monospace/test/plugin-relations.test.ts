import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockClient, createProfilesCollection, createRelationStore, createTodosCollection, runHook, setupPlugin } from './utils/plugin'

const client = createMockClient()

beforeEach(() => {
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
})

describe('createMonospaceRstorePlugin relations', () => {
  it('embeds included relations through nested field selections', async () => {
    const hooks = setupPlugin(client)
    client.readMany.mockResolvedValueOnce([{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }])

    const result: any = await runHook(hooks.fetchMany, {
      collection: createTodosCollection(),
      findOptions: {
        include: { author: true },
      },
      store: createRelationStore(),
    })

    expect(client.readMany).toHaveBeenCalledWith('Todos', {
      fields: ['*', 'author.*'],
    })
    // The API returns the real FK column; nothing is injected or rewritten.
    expect(result[0]).toEqual({
      id: 1,
      title: 'A',
      author_id: 'p1',
      author: { id: 'p1', name: 'Jane' },
    })
  })

  it('appends relation FK columns to explicit fields on key fetches', async () => {
    const hooks = setupPlugin(client)
    client.readOne.mockResolvedValueOnce({ id: 1, author_id: null, author: null })

    await runHook(hooks.fetchFirst, {
      collection: createTodosCollection(),
      findOptions: {
        fields: ['id', 'title'],
        include: { author: true },
      },
      key: 1,
      store: createRelationStore(),
    })

    // `author_id` backs the cache join, so it is added to the explicit
    // selection alongside the embedded relation wildcard.
    expect(client.readOne).toHaveBeenCalledWith('Todos', 1, {
      fields: ['id', 'title', 'author_id', 'author.*'],
    })
  })

  it('unwraps to-many data envelopes on fetched items', async () => {
    const hooks = setupPlugin(client)
    client.readMany.mockResolvedValueOnce([{
      id: 'p1',
      todos: {
        data: [{ id: 1, title: 'A', author_id: 'p1' }],
      },
    }])

    const result: any = await runHook(hooks.fetchMany, {
      collection: createProfilesCollection(),
      findOptions: {
        include: { todos: true },
      },
      store: createRelationStore(),
    })

    expect(result[0].todos).toEqual([{ id: 1, title: 'A', author_id: 'p1' }])
  })

  it('fetches missing relations for cache-served results', async () => {
    const hooks = setupPlugin(client)
    const findMany = vi.fn(async () => [])
    const store = {
      $collection: vi.fn(() => ({ findMany })),
    }

    await hooks.fetchRelations({
      collection: createTodosCollection(),
      findOptions: {
        include: { author: true },
      },
      getResult: () => [{ id: 1 }],
      store,
    })

    expect(store.$collection).toHaveBeenCalledWith('Todos')
    expect(findMany).toHaveBeenCalledWith({
      fetchPolicy: 'fetch-only',
      filter: {
        id: {
          _in: [1],
        },
      },
      include: { author: true },
    })
  })

  it('skips relation fetches when results already embed relations', async () => {
    const hooks = setupPlugin(client)
    const store = {
      $collection: vi.fn(),
    }

    await hooks.fetchRelations({
      collection: createTodosCollection(),
      findOptions: {
        include: { author: true },
      },
      getResult: () => ({ id: 1, author: { id: 'p1' } }),
      store,
    })

    expect(store.$collection).not.toHaveBeenCalled()
  })

  it('skips relation fetches when the FK join resolves from the cache', async () => {
    const hooks = setupPlugin(client)
    const store = createRelationStore({
      cacheItems: {
        Profiles: [{ id: 'p1', name: 'Jane' }],
      },
    })
    store.$collection = vi.fn()

    await hooks.fetchRelations({
      collection: createTodosCollection(),
      findOptions: {
        include: { author: true },
      },
      getResult: () => [{ id: 1, author_id: 'p1' }],
      store,
    })

    expect(store.$collection).not.toHaveBeenCalled()
  })
})
