import { beforeEach, describe, expect, it } from 'vitest'
import { createMockClient, createProfilesCollection, createTodosCollection } from './utils/plugin'
import { createRelationStore, runMonospaceOperation } from './utils/store'

const client = createMockClient()

beforeEach(() => {
  for (const method of Object.values(client)) {
    method.mockReset()
  }
})

describe('monospace relation queries through real store/cache', () => {
  it('embeds included relations through Monospace include selections', async () => {
    client.readMany.mockResolvedValueOnce([{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }])
    const result = await runMonospaceOperation(client, 'fetchMany', {
      collection: createTodosCollection(),
      findOptions: { include: { author: true } },
    })

    expect(client.readMany).toHaveBeenCalledExactlyOnceWith('Todos', {
      fields: ['*'],
      include: { author: { fields: ['*'] } },
    })
    expect(result.map((item: any) => ({
      id: item.id,
      title: item.title,
      author_id: item.author_id,
      author: { id: item.author.id, name: item.author.name },
    }))).toEqual([{ id: 1, title: 'A', author_id: 'p1', author: { id: 'p1', name: 'Jane' } }])
  })

  it('appends relation FK columns to explicit fields on key fetches', async () => {
    client.readOne.mockResolvedValueOnce({ id: 1, author_id: null, author: null })
    const result = await runMonospaceOperation(client, 'fetchFirst', {
      collection: createTodosCollection(),
      key: 1,
      findOptions: { fields: ['id', 'title'], include: { author: true } },
    })

    expect(client.readOne).toHaveBeenCalledExactlyOnceWith('Todos', 1, {
      fields: ['id', 'title', 'author_id'],
      include: { author: { fields: ['*'] } },
    })
    expect(result.id).toBe(1)
    expect(result.author_id).toBeNull()
    expect(result.author).toBeUndefined()
  })

  it('unwraps to-many data envelopes on fetched items', async () => {
    client.readMany.mockResolvedValueOnce([{
      id: 'p1',
      todos: { data: [{ id: 1, title: 'A', author_id: 'p1' }] },
    }])
    const result = await runMonospaceOperation(client, 'fetchMany', {
      collection: createProfilesCollection(),
      findOptions: { include: { todos: true } },
    })

    expect(client.readMany).toHaveBeenCalledExactlyOnceWith('Profiles', {
      fields: ['*'],
      include: { todos: { fields: ['*'], limit: -1 } },
    })
    expect(result[0].todos.map((item: any) => ({ id: item.id, title: item.title, author_id: item.author_id })))
      .toEqual([{ id: 1, title: 'A', author_id: 'p1' }])
  })

  it('recovers missing relations for cache-served results', async () => {
    const store = await createRelationStore(client, { cacheItems: { Todos: [{ id: 1 }] }, cachedQueries: { Todos: [{ include: { author: true } }] } })
    client.readMany.mockResolvedValueOnce([{
      id: 1,
      author_id: 'p1',
      author: { id: 'p1', name: 'Jane' },
    }])

    const result = await store.Todos.findMany({ include: { author: true } })

    expect(client.readMany).toHaveBeenCalledExactlyOnceWith('Todos', {
      fields: ['*'],
      filter: { id: { _in: [1] } },
      include: { author: { fields: ['*'] } },
    })
    expect(result.map((item: any) => ({ id: item.id, name: item.author?.name }))).toEqual([{ id: 1, name: 'Jane' }])
  })

  it('skips external reads for already embedded relations', async () => {
    const store = await createRelationStore(client, {
      cacheItems: { Todos: [{ id: 1, author_id: 'p1', author: { id: 'p1', name: 'Jane' } }] },
      cachedQueries: { Todos: [{ include: { author: true } }] },
    })

    const result = await store.Todos.findMany({ include: { author: true } })

    expect(result[0].author.name).toBe('Jane')
    expect(client.readMany).not.toHaveBeenCalled()
    expect(client.readOne).not.toHaveBeenCalled()
  })

  it('skips external reads when an FK join resolves from separately cached records', async () => {
    const store = await createRelationStore(client, {
      cacheItems: { Profiles: [{ id: 'p1', name: 'Jane' }], Todos: [{ id: 1, author_id: 'p1' }] },
      cachedQueries: { Todos: [{ include: { author: true } }] },
    })

    const result = await store.Todos.findMany({ include: { author: true } })

    expect(result[0].author.name).toBe('Jane')
    expect(client.readMany).not.toHaveBeenCalled()
    expect(client.readOne).not.toHaveBeenCalled()
  })
})
