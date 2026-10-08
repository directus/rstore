import { describe, expect, it } from 'vitest'
import { createMonospaceReadQuery } from '../src'
import { createProfilesCollection, createTodosCollection } from './utils/plugin'

/**
 * Creates the read context for a collection backed by the default relation store.
 */
function createContext(collection: any) {
  return { collection, store: { $collections: [createTodosCollection(), createProfilesCollection()] } }
}

describe('createMonospaceReadQuery', () => {
  it('selects every primitive field when no fields are given', () => {
    // Monospace 1.0 rejects reads without a `fields` selection.
    expect(createMonospaceReadQuery({}, createContext(createTodosCollection()))).toEqual({
      fields: ['*'],
    })
  })

  it('keeps explicit fields and applies overrides', () => {
    expect(createMonospaceReadQuery({ fields: ['id', 'title'] }, createContext(createTodosCollection()), { limit: 1 })).toEqual({
      fields: ['id', 'title'],
      limit: 1,
    })
  })

  it('maps included to-one relations to wildcard include selections', () => {
    expect(createMonospaceReadQuery({ include: { author: true } }, createContext(createTodosCollection()))).toEqual({
      fields: ['*'],
      include: {
        author: { fields: ['*'] },
      },
    })
  })

  it('lifts the default per-parent limit on included to-many relations', () => {
    expect(createMonospaceReadQuery({ include: { todos: true } }, createContext(createProfilesCollection()))).toEqual({
      fields: ['*'],
      include: {
        todos: { fields: ['*'], limit: -1 },
      },
    })
  })

  it('maps nested includes using the target collection relations', () => {
    const query = createMonospaceReadQuery({
      include: { author: { include: { todos: true } } },
    }, createContext(createTodosCollection()))

    expect(query.include).toEqual({
      author: {
        fields: ['*'],
        include: {
          todos: { fields: ['*'], limit: -1 },
        },
      },
    })
  })

  it('accepts the direct nested include form', () => {
    const query = createMonospaceReadQuery({
      include: { author: { todos: true } },
    }, createContext(createTodosCollection()))

    expect(query.include).toEqual({
      author: {
        fields: ['*'],
        include: {
          todos: { fields: ['*'], limit: -1 },
        },
      },
    })
  })

  it('skips disabled includes', () => {
    expect(createMonospaceReadQuery({ include: { author: false } }, createContext(createTodosCollection()))).toEqual({
      fields: ['*'],
    })
  })

  it('appends parent-side FK columns backing included relations to explicit fields', () => {
    expect(createMonospaceReadQuery({
      fields: ['id', 'title'],
      include: { author: true },
    }, createContext(createTodosCollection())).fields).toEqual(['id', 'title', 'author_id'])

    expect(createMonospaceReadQuery({
      fields: ['name'],
      include: { todos: true },
    }, createContext(createProfilesCollection())).fields).toEqual(['name', 'id'])

    expect(createMonospaceReadQuery({
      fields: 'id,author_id' as any,
      include: { author: true },
    }, createContext(createTodosCollection())).fields).toEqual(['id', 'author_id'])
  })

  it('merges raw Monospace include options from params, user values winning', () => {
    const query = createMonospaceReadQuery({
      include: { todos: true },
      params: {
        include: {
          todos: {
            filter: { completed: { _eq: false } },
            limit: 5,
          },
        },
      },
    }, createContext(createProfilesCollection()))

    expect(query.include).toEqual({
      todos: {
        fields: ['*'],
        filter: { completed: { _eq: false } },
        limit: 5,
      },
    })
  })

  it('completes raw include entries that are not rstore includes', () => {
    const query = createMonospaceReadQuery({
      fields: ['id'],
      params: {
        include: {
          author: {},
        },
      },
    }, createContext(createTodosCollection()))

    expect(query).toEqual({
      fields: ['id', 'author_id'],
      include: {
        author: { fields: ['*'] },
      },
    })
  })

  it('adds join and primary key columns to narrowed include fields', () => {
    const query = createMonospaceReadQuery({
      include: { todos: true },
      params: {
        include: {
          todos: { fields: ['title'] },
        },
      },
    }, createContext(createProfilesCollection()))

    // `author_id` joins the related todos back to their profile and `id`
    // keys them in the rstore cache.
    expect(query.include).toEqual({
      todos: { fields: ['title', 'author_id', 'id'], limit: -1 },
    })
  })
})
