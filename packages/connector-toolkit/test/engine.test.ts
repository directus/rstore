import type { FilterContext } from '../src'
import { describe, expect, it } from 'vitest'
import { createFilterEngine, normalizeSort, normalizeSortStrings, supported, unsupported } from '../src'

/**
 * Mini dialect mirroring the Monospace connector behavior.
 */
const mono = createFilterEngine({
  name: 'Monospace',
  supportsNotGroup: true,
  equalityShorthand: true,
  rejectNestedFieldKeys: true,
  unsupportedOperatorReason: (operator) => {
    return ['_some', '_every', '_none'].includes(operator)
      ? `Relation quantifier "${operator}" cannot be evaluated cache-side`
      : undefined
  },
  unsupportedQueryChecks: [{
    test: query => !!(query?.deep || query?.alias),
    reason: 'Nested or aliased Monospace queries require a fetch',
  }],
  normalizeSort: sort => normalizeSort(sort, { dialectName: 'Monospace' }),
  paginate: { unlimitedSentinels: true },
})

/**
 * Mini dialect mirroring the Directus connector behavior.
 */
const directus = createFilterEngine({
  name: 'Directus',
  readItemValue: (item, key) => key === 'upper(name)' ? String(item.name).toUpperCase() : item[key],
  resolveFilterValue: (value, context: FilterContext) => {
    if (value === '$NOW') {
      return { supported: true, value: context.now ?? new Date() }
    }
    if (typeof value === 'string' && value.startsWith('$CURRENT_')) {
      return unsupported(`Dynamic variable "${value}" requires Directus auth context`)
    }
    return { supported: true, value }
  },
  extraOperators: (itemValue, operator) => operator === '_nnull' ? supported(itemValue != null) : undefined,
  unsupportedQueryChecks: [{
    test: query => !!query?.search,
    reason: 'Directus search cannot be evaluated cache-side',
  }],
  normalizeSort: sort => ({ supported: true, fields: normalizeSortStrings(sort as string | string[] | undefined) }),
  paginate: { supportsPage: true },
})

describe('createFilterEngine evaluateFilter', () => {
  it('matches empty filters', () => {
    expect(mono.evaluateFilter({ id: 1 }, undefined)).toEqual({ supported: true, matches: true })
    expect(mono.evaluateFilter({ id: 1 }, {})).toEqual({ supported: true, matches: true })
  })

  it('applies equality shorthand only when enabled', () => {
    expect(mono.evaluateFilter({ status: 'published' }, { status: 'published' })).toEqual({ supported: true, matches: true })
    expect(directus.evaluateFilter({ status: 'published' }, { status: 'published' })).toEqual({
      supported: false,
      reason: 'Invalid Directus filter for "status"',
    })
  })

  it('rejects array filter values with the dialect name', () => {
    expect(mono.evaluateFilter({ id: 1 }, { id: [1] })).toEqual({
      supported: false,
      reason: 'Invalid Monospace filter for "id"',
    })
  })

  it('evaluates _and, _or, and _not groups', () => {
    const filter = {
      _and: [
        { _or: [{ id: { _eq: 1 } }, { id: { _eq: 2 } }] },
        { _not: { status: { _eq: 'draft' } } },
      ],
    }

    expect(mono.evaluateFilter({ id: 2, status: 'published' }, filter)).toEqual({ supported: true, matches: true })
    expect(mono.evaluateFilter({ id: 2, status: 'draft' }, filter)).toEqual({ supported: true, matches: false })
    expect(mono.evaluateFilter({ id: 3, status: 'published' }, filter)).toEqual({ supported: true, matches: false })
  })

  it('rejects malformed logical groups with dialect-prefixed reasons', () => {
    expect(mono.evaluateFilter({}, { _and: {} })).toEqual({
      supported: false,
      reason: 'Monospace _and expects an array',
    })
    expect(mono.evaluateFilter({}, { _or: {} })).toEqual({
      supported: false,
      reason: 'Monospace _or expects an array',
    })
    expect(mono.evaluateFilter({}, { _not: [] })).toEqual({
      supported: false,
      reason: 'Monospace _not expects a filter object',
    })
  })

  it('treats _not as a field when the dialect has no _not group', () => {
    expect(directus.evaluateFilter({}, { _not: { status: { _eq: 'draft' } } })).toEqual({
      supported: false,
      reason: 'Filter operator not supported: status',
    })
  })

  it('rejects relation filters from the collection context', () => {
    const context = { collection: { name: 'posts', relations: { author: {} } } }

    expect(mono.evaluateFilter({}, { author: { name: { _eq: 'a' } } }, context)).toEqual({
      supported: false,
      reason: 'Relation filter "author" cannot be evaluated cache-side',
    })
  })

  it('rejects nested field keys only when the dialect asks for it', () => {
    expect(mono.evaluateFilter({}, { author: { name: 'a' } })).toEqual({
      supported: false,
      reason: 'Relational filter "author.name" cannot be evaluated cache-side',
    })
  })

  it('rejects dialect-specific unsupported operators', () => {
    expect(mono.evaluateFilter({}, { tags: { _some: { _eq: 'a' } } })).toEqual({
      supported: false,
      reason: 'Relation quantifier "_some" cannot be evaluated cache-side',
    })
  })

  it('resolves dynamic filter values and bubbles unsupported ones', () => {
    const now = new Date('2024-06-01T00:00:00Z')

    expect(directus.evaluateFilter(
      { date: '2024-01-01T00:00:00Z' },
      { date: { _lt: '$NOW' } },
      { now },
    )).toEqual({ supported: true, matches: true })

    expect(directus.evaluateFilter({}, { user: { _eq: '$CURRENT_USER' } })).toEqual({
      supported: false,
      reason: 'Dynamic variable "$CURRENT_USER" requires Directus auth context',
    })
  })

  it('evaluates extra operators and reads item values through the dialect', () => {
    expect(directus.evaluateFilter({ id: 1 }, { id: { _nnull: true } })).toEqual({ supported: true, matches: true })
    expect(directus.evaluateFilter({ name: 'ada' }, { 'upper(name)': { _eq: 'ADA' } })).toEqual({ supported: true, matches: true })
  })

  it('bubbles unsupported operator evaluations', () => {
    expect(mono.evaluateFilter({ id: 1 }, { id: { _regex: 'x' } })).toEqual({
      supported: false,
      reason: 'Filter operator not supported: _regex',
    })
  })
})

describe('createFilterEngine applyQuery', () => {
  const items = [
    { id: 1, status: 'published', title: 'b' },
    { id: 2, status: 'draft', title: 'a' },
    { id: 3, status: 'published', title: 'a' },
    { id: 4, status: 'published', title: 'c' },
  ]

  it('filters, sorts, and paginates in one pass', () => {
    const result = mono.applyQuery(items, {
      filter: { status: { _eq: 'published' } },
      sort: [{ title: 'asc' }],
      limit: 2,
    })

    expect(result).toEqual({
      supported: true,
      items: [items[2], items[0]],
    })
  })

  it('applies dialect pagination options', () => {
    // Monospace treats limit 0 as unlimited.
    const monoResult = mono.applyQuery(items, { limit: 0 })
    expect(monoResult.supported && monoResult.items).toHaveLength(4)

    // Directus honours 1-based pages.
    const directusResult = directus.applyQuery(items, { limit: 2, page: 2 })
    expect(directusResult).toEqual({
      supported: true,
      items: [items[2], items[3]],
    })
  })

  it('rejects unsupported query shapes', () => {
    expect(mono.applyQuery(items, { deep: { author: {} } })).toEqual({
      supported: false,
      reason: 'Nested or aliased Monospace queries require a fetch',
    })
    expect(directus.applyQuery(items, { search: 'hello' })).toEqual({
      supported: false,
      reason: 'Directus search cannot be evaluated cache-side',
    })
  })

  it('bubbles unsupported filter and sort evaluations', () => {
    expect(mono.applyQuery(items, { filter: { id: { _regex: 'x' } } })).toEqual({
      supported: false,
      reason: 'Filter operator not supported: _regex',
    })
    expect(mono.applyQuery(items, { sort: [{ title: { nulls: 'first' } }] })).toEqual({
      supported: false,
      reason: 'Monospace sort nulls placement cannot be evaluated cache-side',
    })
  })

  it('returns all items for an empty query', () => {
    expect(mono.applyQuery(items, undefined)).toEqual({ supported: true, items })
  })
})
