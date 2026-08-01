import { describe, expect, it } from 'vitest'
import { applyDirectusQuery, evaluateDirectusFilter } from '../src'

const collection = {
  name: 'Todos',
  relations: {
    owner: {
      to: {
        Users: {
          on: {
            id: 'owner_id',
          },
        },
      },
    },
  },
}

describe('evaluateDirectusFilter', () => {
  it('uses Directus default AND semantics for sibling fields', () => {
    const result = evaluateDirectusFilter({
      id: 1,
      completed: false,
      priority: 2,
    }, {
      completed: { _eq: false },
      priority: { _gte: 3 },
    }, { collection })

    expect(result).toEqual({
      supported: true,
      matches: false,
    })
  })

  it('supports nested _and and _or groups', () => {
    const result = evaluateDirectusFilter({
      completed: false,
      priority: 2,
      title: 'urgent fix',
    }, {
      _and: [
        { completed: { _eq: false } },
        {
          _or: [
            { priority: { _gte: 3 } },
            { title: { _icontains: 'URGENT' } },
          ],
        },
      ],
    }, { collection })

    expect(result).toEqual({
      supported: true,
      matches: true,
    })
  })

  it('supports the negative case-insensitive contains operator', () => {
    expect(evaluateDirectusFilter({
      title: 'Ship Directus support',
    }, {
      title: { _nicontains: 'blocked' },
    }, { collection })).toEqual({
      supported: true,
      matches: true,
    })
  })

  it('supports $NOW adjustments and function parameters', () => {
    const now = new Date('2026-05-02T12:00:00.000Z')

    expect(evaluateDirectusFilter({
      published_at: '2026-05-01T12:00:00.000Z',
      created_at: '2026-01-10T00:00:00.000Z',
    }, {
      'published_at': { _lte: '$NOW(-12 hours)' },
      'year(created_at)': { _eq: 2026 },
    }, { collection, now })).toEqual({
      supported: true,
      matches: true,
    })
  })

  it('requires boolean operands for _null and _nnull', () => {
    const item = { title: 'Todo', description: null }

    expect(evaluateDirectusFilter(item, { description: { _null: true } }, { collection })).toEqual({ supported: true, matches: true })
    expect(evaluateDirectusFilter(item, { description: { _null: false } }, { collection })).toEqual({ supported: true, matches: false })
    expect(evaluateDirectusFilter(item, { title: { _nnull: true } }, { collection })).toEqual({ supported: true, matches: true })
    expect(evaluateDirectusFilter(item, { description: { _nnull: false } }, { collection })).toEqual({ supported: true, matches: true })
    // Non-boolean operands fall back to a remote fetch.
    expect(evaluateDirectusFilter(item, { description: { _null: 1 } }, { collection })).toEqual({
      supported: false,
      reason: '_null expects a boolean value',
    })
    expect(evaluateDirectusFilter(item, { title: { _nnull: 'yes' } }, { collection })).toEqual({
      supported: false,
      reason: '_nnull expects a boolean value',
    })
  })

  it('marks relation and geometry filters as unsupported', () => {
    expect(evaluateDirectusFilter({ id: 1 }, {
      owner: {
        _some: {
          id: { _eq: 1 },
        },
      },
    }, { collection })).toMatchObject({
      supported: false,
    })

    expect(evaluateDirectusFilter({ id: 1 }, {
      location: {
        _intersects: { type: 'Point', coordinates: [0, 0] },
      },
    }, { collection })).toMatchObject({
      supported: false,
    })
  })
})

describe('applyDirectusQuery', () => {
  it('filters, sorts, and paginates cache items', () => {
    const result = applyDirectusQuery([
      { id: 1, title: 'Later', completed: false, priority: 1 },
      { id: 2, title: 'Now', completed: true, priority: 3 },
      { id: 3, title: 'Soon', completed: false, priority: 5 },
      { id: 4, title: 'Next', completed: false, priority: 2 },
    ], {
      filter: { completed: { _eq: false } },
      sort: ['-priority'],
      limit: 2,
      offset: 1,
    }, { collection })

    expect(result).toEqual({
      supported: true,
      items: [
        { id: 4, title: 'Next', completed: false, priority: 2 },
        { id: 1, title: 'Later', completed: false, priority: 1 },
      ],
    })
  })

  it('sorts nulls last ascending, nulls first descending, and strings by locale', () => {
    const items = [
      { id: 1, title: 'bravo', priority: 2 },
      { id: 2, title: 'Alpha', priority: null },
      { id: 3, title: 'charlie', priority: 1 },
    ]

    const ascending = applyDirectusQuery(items, { sort: ['priority'] }, { collection })
    expect(ascending.supported && ascending.items.map(item => item.id)).toEqual([3, 1, 2])

    const descending = applyDirectusQuery(items, { sort: ['-priority'] }, { collection })
    expect(descending.supported && descending.items.map(item => item.id)).toEqual([2, 1, 3])

    // `localeCompare` orders strings case-insensitively unlike `<`/`>`.
    const byTitle = applyDirectusQuery(items, { sort: 'title' }, { collection })
    expect(byTitle.supported && byTitle.items.map(item => item.id)).toEqual([2, 1, 3])
  })

  it('marks search as unsupported for cache-side evaluation', () => {
    expect(applyDirectusQuery([
      { id: 1, title: 'Later' },
    ], {
      search: 'later',
    }, { collection })).toMatchObject({
      supported: false,
    })
  })
})
