import { describe, expect, it, vi } from 'vitest'
import {
  applyMonospaceIncludeFields,
  createMonospaceIncludeFields,
  fetchMissingMonospaceRelations,
  normalizeMonospaceRelationItems,
} from '../src'
import { createProfilesCollection, createRelationStore, createTodosCollection } from './utils/plugin'

describe('createMonospaceIncludeFields', () => {
  it('maps include options to nested wildcard field selections', () => {
    expect(createMonospaceIncludeFields({ author: true })).toEqual(['author.*'])
    expect(createMonospaceIncludeFields({ author: true, todos: false })).toEqual(['author.*'])
    expect(createMonospaceIncludeFields(undefined)).toEqual([])
  })

  it('supports nested includes recursively', () => {
    expect(createMonospaceIncludeFields({
      author: {
        include: {
          todos: true,
        },
      },
    })).toEqual(['author.*', 'author.todos.*'])
  })
})

describe('applyMonospaceIncludeFields', () => {
  it('adds a base wildcard when no fields are selected', () => {
    const query = applyMonospaceIncludeFields({} as { fields?: string[] }, { author: true }, createTodosCollection())
    expect(query.fields).toEqual(['*', 'author.*'])
  })

  it('appends the relation FK columns to explicit field selections', () => {
    // `author_id` backs the cache join of the included relation, so it is
    // added to the explicit selection (a `*` base already includes it).
    const query = applyMonospaceIncludeFields({ fields: ['id', 'title'] }, { author: true }, createTodosCollection())
    expect(query.fields).toEqual(['id', 'title', 'author_id', 'author.*'])
  })

  it('appends backward relation source columns to explicit field selections', () => {
    const query = applyMonospaceIncludeFields({ fields: ['name'] }, { todos: true }, createProfilesCollection())
    expect(query.fields).toEqual(['name', 'id', 'todos.*'])
  })

  it('does not duplicate backing columns already selected', () => {
    const query = applyMonospaceIncludeFields({ fields: ['id', 'author_id'] }, { author: true }, createTodosCollection())
    expect(query.fields).toEqual(['id', 'author_id', 'author.*'])
  })

  it('keeps queries untouched without includes', () => {
    const query = applyMonospaceIncludeFields({ fields: ['id'] }, undefined, createTodosCollection())
    expect(query.fields).toEqual(['id'])
  })
})

describe('normalizeMonospaceRelationItems', () => {
  it('keeps embedded to-one objects and FK columns untouched', () => {
    const item: any = { id: 1, author_id: 'p1', author: { id: 'p1', name: 'Jane' } }
    normalizeMonospaceRelationItems(createRelationStore(), createTodosCollection(), [item])

    expect(item).toEqual({ id: 1, author_id: 'p1', author: { id: 'p1', name: 'Jane' } })
  })

  it('unwraps to-many data envelopes', () => {
    const item: any = {
      id: 'p1',
      todos: {
        data: [{ id: 1, title: 'A', author_id: 'p1' }, { id: 2, title: 'B', author_id: 'p1' }],
      },
    }
    normalizeMonospaceRelationItems(createRelationStore(), createProfilesCollection(), [item])

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
    normalizeMonospaceRelationItems(createRelationStore(), createTodosCollection(), [item])

    expect(item.author.todos).toEqual([{ id: 2 }])
  })

  it('tolerates circular payloads and missing metadata', () => {
    const todo: any = { id: 1 }
    const profile: any = { id: 'p1', todos: { data: [todo] } }
    todo.author = profile
    normalizeMonospaceRelationItems(createRelationStore(), createTodosCollection(), [todo])

    expect(Array.isArray(profile.todos)).toBe(true)
    expect(profile.todos[0]).toBe(todo)
    expect(() => normalizeMonospaceRelationItems(undefined, { name: 'Todos' } as any, [{ id: 1 }])).not.toThrow()
  })
})

describe('fetchMissingMonospaceRelations', () => {
  /**
   * Creates a relation store whose Todos findMany calls are recorded.
   */
  function createFetchingStore(cacheItems: Record<string, any[]> = {}) {
    const store = createRelationStore({ cacheItems })
    const findMany = vi.fn(async () => [])
    store.$collection = vi.fn(() => ({ findMany }))
    return { findMany, store }
  }

  it('re-fetches items whose relation state is unknown', async () => {
    const { findMany, store } = createFetchingStore()

    // No embedded relation and no fetched FK column: the state is unknown.
    await fetchMissingMonospaceRelations(store, createTodosCollection(), [
      { id: 1 },
      { id: 2, author: null },
      { id: 3 },
    ], { author: true })

    expect(store.$collection).toHaveBeenCalledWith('Todos')
    expect(findMany).toHaveBeenCalledWith({
      fetchPolicy: 'fetch-only',
      filter: {
        id: {
          _in: [1, 3],
        },
      },
      include: { author: true },
    })
  })

  it('skips fetching when relations are already embedded', async () => {
    const { store } = createFetchingStore()
    store.$collection = vi.fn()

    await fetchMissingMonospaceRelations(store, createTodosCollection(), [
      { id: 1, author: { id: 'p1' } },
      { id: 2, author: null },
    ], { author: true })

    expect(store.$collection).not.toHaveBeenCalled()
  })

  it('skips fetching to-one relations with a null FK column', async () => {
    const { store } = createFetchingStore()
    store.$collection = vi.fn()

    // A null FK means the relation is empty: nothing to fetch.
    await fetchMissingMonospaceRelations(store, createTodosCollection(), [
      { id: 1, author_id: null },
    ], { author: true })

    expect(store.$collection).not.toHaveBeenCalled()
  })

  it('skips fetching to-one relations resolvable from the cache through the FK column', async () => {
    const { store } = createFetchingStore({
      Profiles: [{ id: 'p1', name: 'Jane' }],
    })

    await fetchMissingMonospaceRelations(store, createTodosCollection(), [
      { id: 1, author_id: 'p1' },
    ], { author: true })

    expect(store.$collection).not.toHaveBeenCalled()
  })

  it('re-fetches to-one relations whose FK target is not cached', async () => {
    const { findMany, store } = createFetchingStore({
      Profiles: [{ id: 'p2', name: 'John' }],
    })

    await fetchMissingMonospaceRelations(store, createTodosCollection(), [
      { id: 1, author_id: 'p1' },
    ], { author: true })

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

  it('re-fetches to-many relations that are not embedded', async () => {
    const { findMany, store } = createFetchingStore({
      // Even with matching target items cached, an absent to-many field
      // cannot be distinguished from a not-yet-loaded relation.
      Todos: [{ id: 1, author_id: 'p1' }],
    })

    await fetchMissingMonospaceRelations(store, createProfilesCollection(), [
      { id: 'p1' },
    ], { todos: true })

    expect(findMany).toHaveBeenCalledWith({
      fetchPolicy: 'fetch-only',
      filter: {
        id: {
          _in: ['p1'],
        },
      },
      include: { todos: true },
    })
  })

  it('checks relation presence on the raw data of wrapped cache items', async () => {
    const { findMany, store } = createFetchingStore()

    // Wrapped items report relation keys as present through their proxy, so
    // presence must be checked through `$raw()`.
    const wrappedMissing = { id: 1, author: undefined, $raw: () => ({ id: 1 }) }
    const wrappedEmbedded = { id: 2, $raw: () => ({ id: 2, author: null }) }

    await fetchMissingMonospaceRelations(store, createTodosCollection(), [
      wrappedMissing,
      wrappedEmbedded,
    ], { author: true })

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

  it('throws for includes that do not match a relation', async () => {
    await expect(fetchMissingMonospaceRelations({
      $collection: vi.fn(),
    } as any, createTodosCollection(), [{ id: 1 }], { unknown: true })).rejects.toThrow(
      'Relation "unknown" does not exist on collection "Todos"',
    )
  })
})
