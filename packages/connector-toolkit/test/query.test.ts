import { describe, expect, it } from 'vitest'
import { createConnectorQuery, stripPrimaryKeys } from '../src'

const KNOWN_KEYS = ['fields', 'filter', 'sort', 'limit', 'offset', 'page'] as const

describe('createConnectorQuery', () => {
  it('copies known keys only and ignores unknown find options', () => {
    const query = createConnectorQuery({
      filter: { id: { _eq: 1 } },
      sort: ['title'],
      include: { author: true },
    }, {}, { knownKeys: KNOWN_KEYS })

    expect(query).toEqual({
      filter: { id: { _eq: 1 } },
      sort: ['title'],
    })
  })

  it('copies known keys only from params by default', () => {
    const query = createConnectorQuery({
      params: { fields: ['id'], custom: 'x' },
    }, {}, { knownKeys: KNOWN_KEYS })

    expect(query).toEqual({ fields: ['id'] })
  })

  it('merges params wholesale with mergeParams', () => {
    const query = createConnectorQuery({
      params: { fields: ['id'], custom: 'x' },
      filter: { id: { _eq: 1 } },
    }, {}, { knownKeys: KNOWN_KEYS, mergeParams: true })

    expect(query).toEqual({
      fields: ['id'],
      custom: 'x',
      filter: { id: { _eq: 1 } },
    })
  })

  it('lets top-level find options win over params', () => {
    const query = createConnectorQuery({
      params: { limit: 5 },
      limit: 10,
    }, {}, { knownKeys: KNOWN_KEYS })

    expect(query).toEqual({ limit: 10 })
  })

  it('maps pageIndex and pageSize to limit and offset', () => {
    const query = createConnectorQuery({
      pageIndex: 2,
      pageSize: 25,
    }, {}, { knownKeys: KNOWN_KEYS })

    expect(query).toEqual({ limit: 25, offset: 50 })
  })

  it('skips the page mapping when explicit pagination is set', () => {
    expect(createConnectorQuery({
      pageIndex: 2,
      pageSize: 25,
      limit: 5,
    }, {}, { knownKeys: KNOWN_KEYS })).toEqual({ limit: 5 })

    expect(createConnectorQuery({
      pageIndex: 2,
      pageSize: 25,
      offset: 1,
    }, {}, { knownKeys: KNOWN_KEYS })).toEqual({ offset: 1 })
  })

  it('guards the page mapping on the page option only with respectPageOption', () => {
    const findOptions = { pageIndex: 2, pageSize: 25, page: 3 }

    expect(createConnectorQuery(findOptions, {}, {
      knownKeys: KNOWN_KEYS,
      respectPageOption: true,
    })).toEqual({ page: 3 })

    expect(createConnectorQuery(findOptions, {}, {
      knownKeys: KNOWN_KEYS,
    })).toEqual({ page: 3, limit: 25, offset: 50 })
  })

  it('applies overrides last', () => {
    const query = createConnectorQuery({
      limit: 10,
    }, { limit: 1, fields: ['id'] }, { knownKeys: KNOWN_KEYS })

    expect(query).toEqual({ limit: 1, fields: ['id'] })
  })

  it('strips function filters from find options and params', () => {
    const predicate = (item: any): boolean => !!item

    expect(createConnectorQuery({ filter: predicate }, {}, { knownKeys: KNOWN_KEYS })).toEqual({})
    expect(createConnectorQuery({ params: { filter: predicate } }, {}, {
      knownKeys: KNOWN_KEYS,
      mergeParams: true,
    })).toEqual({})
  })
})

describe('stripPrimaryKeys', () => {
  it('removes the given primary keys', () => {
    expect(stripPrimaryKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toEqual({ c: 3 })
  })

  it('defaults to the id key', () => {
    expect(stripPrimaryKeys({ id: 1, title: 'x' }, undefined)).toEqual({ title: 'x' })
    expect(stripPrimaryKeys({ id: 1, title: 'x' }, [])).toEqual({ title: 'x' })
  })

  it('does not mutate the original item', () => {
    const item = { id: 1, title: 'x' }
    stripPrimaryKeys(item, undefined)
    expect(item).toEqual({ id: 1, title: 'x' })
  })
})
