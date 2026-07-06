import { describe, expect, it } from 'vitest'
import { applyMonospaceQuery, evaluateMonospaceFilter } from '../src'

describe('evaluateMonospaceFilter', () => {
  it('matches items with comparison operators', () => {
    const item = { id: 5, title: 'Buy milk', priority: 3 }

    expect(evaluateMonospaceFilter(item, { id: { _eq: 5 } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { id: { _neq: 5 } })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { priority: { _gt: 2 } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { priority: { _gte: 3 } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { priority: { _lt: 3 } })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { priority: { _lte: 3 } })).toEqual({ supported: true, matches: true })
  })

  it('compares ISO date strings chronologically', () => {
    const item = { createdAt: '2026-07-02T10:00:00Z' }

    expect(evaluateMonospaceFilter(item, { createdAt: { _gte: '2026-07-01' } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { createdAt: { _lt: '2026-07-01' } })).toEqual({ supported: true, matches: false })
  })

  it('matches list and range operators', () => {
    const item = { id: 2, priority: 5 }

    expect(evaluateMonospaceFilter(item, { id: { _in: [1, 2, 3] } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { id: { _nin: [1, 2, 3] } })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { priority: { _between: [1, 5] } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { priority: { _nbetween: [1, 5] } })).toEqual({ supported: true, matches: false })
  })

  it('matches string operators with case variants', () => {
    const item = { title: 'Buy Milk' }

    expect(evaluateMonospaceFilter(item, { title: { _contains: 'Milk' } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { title: { _contains: 'milk' } })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { title: { _icontains: 'milk' } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { title: { _ncontains: 'milk' } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { title: { _nicontains: 'milk' } })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { title: { _starts_with: 'Buy' } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { title: { _nstarts_with: 'Buy' } })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { title: { _ends_with: 'Milk' } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { title: { _nends_with: 'Milk' } })).toEqual({ supported: true, matches: false })
  })

  it('matches the boolean _null operator', () => {
    const item = { title: 'Todo', description: null }

    expect(evaluateMonospaceFilter(item, { description: { _null: true } })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { description: { _null: false } })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { title: { _null: false } })).toEqual({ supported: true, matches: true })
  })

  it('supports the Monospace equality shorthand', () => {
    const item = { status: 'published', priority: 3 }

    expect(evaluateMonospaceFilter(item, { status: 'published' })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, { status: 'draft' })).toEqual({ supported: true, matches: false })
    expect(evaluateMonospaceFilter(item, { priority: 3 })).toEqual({ supported: true, matches: true })
  })

  it('combines multiple keys and operators with implicit AND', () => {
    const item = { completed: false, priority: 3 }

    expect(evaluateMonospaceFilter(item, {
      completed: { _eq: false },
      priority: { _gte: 1, _lte: 5 },
    })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, {
      completed: { _eq: false },
      priority: { _gte: 4 },
    })).toEqual({ supported: true, matches: false })
  })

  it('evaluates _and, _or, and _not groups', () => {
    const item = { completed: false, priority: 3 }

    expect(evaluateMonospaceFilter(item, {
      _and: [
        { completed: { _eq: false } },
        { priority: { _gte: 1 } },
      ],
    })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, {
      _or: [
        { completed: { _eq: true } },
        { priority: { _eq: 3 } },
      ],
    })).toEqual({ supported: true, matches: true })
    expect(evaluateMonospaceFilter(item, {
      _not: { completed: { _eq: false } },
    })).toEqual({ supported: true, matches: false })
  })

  it('reports relational filters as unsupported', () => {
    const item = { author: 'author-1' }

    expect(evaluateMonospaceFilter(item, {
      author: { name: { _eq: 'Jane' } },
    })).toMatchObject({ supported: false })
    expect(evaluateMonospaceFilter(item, {
      comments: { _some: { approved: { _eq: true } } },
    })).toMatchObject({ supported: false })
  })

  it('reports unknown operators as unsupported', () => {
    expect(evaluateMonospaceFilter({ title: 'Todo' }, {
      title: { _regex: '^T' },
    })).toMatchObject({ supported: false })
  })
})

describe('applyMonospaceQuery', () => {
  const items = [
    { id: 1, title: 'Charlie', completed: false, priority: 2 },
    { id: 2, title: 'alpha', completed: true, priority: 1 },
    { id: 3, title: 'Bravo', completed: false, priority: 3 },
    { id: 4, title: 'Delta', completed: false, priority: null },
  ]

  it('filters, sorts, and paginates cache items', () => {
    const result = applyMonospaceQuery(items, {
      filter: { completed: { _eq: false } },
      sort: [{ priority: { direction: 'asc' } }],
      limit: 2,
    })

    expect(result).toEqual({
      supported: true,
      items: [
        { id: 1, title: 'Charlie', completed: false, priority: 2 },
        { id: 3, title: 'Bravo', completed: false, priority: 3 },
      ],
    })
  })

  it('supports string and shorthand sort specifiers', () => {
    const byTitle = applyMonospaceQuery(items, { sort: ['title'] })
    expect(byTitle.supported && byTitle.items.map(item => item.id)).toEqual([2, 3, 1, 4])

    const byPriorityDesc = applyMonospaceQuery(items, { sort: [{ priority: 'desc' }] })
    expect(byPriorityDesc.supported && byPriorityDesc.items.map(item => item.id)).toEqual([4, 3, 1, 2])
  })

  it('sorts null values last in ascending order', () => {
    const result = applyMonospaceQuery(items, { sort: [{ priority: { direction: 'asc' } }] })
    expect(result.supported && result.items.map(item => item.id)).toEqual([2, 1, 3, 4])
  })

  it('treats zero and negative limits as unlimited like Monospace', () => {
    expect(applyMonospaceQuery(items, { limit: 0 })).toMatchObject({ items })
    expect(applyMonospaceQuery(items, { limit: -1 })).toMatchObject({ items })
    expect(applyMonospaceQuery(items, { limit: 2, offset: 1 })).toMatchObject({
      items: items.slice(1, 3),
    })
  })

  it('reports queries that require a fetch as unsupported', () => {
    expect(applyMonospaceQuery(items, { deep: { comments: { _limit: 2 } } })).toMatchObject({ supported: false })
    expect(applyMonospaceQuery(items, { alias: { name: 'title' } })).toMatchObject({ supported: false })
    expect(applyMonospaceQuery(items, { sort: [{ priority: { direction: 'asc', nulls: 'first' } }] })).toMatchObject({ supported: false })
    expect(applyMonospaceQuery(items, { filter: { author: { name: { _eq: 'Jane' } } } })).toMatchObject({ supported: false })
  })
})
