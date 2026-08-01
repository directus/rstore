import { describe, expect, it } from 'vitest'
import { compareValues, normalizeSort, normalizeSortStrings, sortItems } from '../src'

describe('sortItems', () => {
  it('sorts nulls last ascending and first descending', () => {
    const items = [{ v: null }, { v: 2 }, { v: 1 }]

    expect(sortItems(items, [{ field: 'v', desc: false }]).map(item => item.v)).toEqual([1, 2, null])
    expect(sortItems(items, [{ field: 'v', desc: true }]).map(item => item.v)).toEqual([null, 2, 1])
  })

  it('compares strings with localeCompare', () => {
    const items = [{ v: 'b' }, { v: 'A' }, { v: 'a' }]

    expect(sortItems(items, [{ field: 'v', desc: false }]).map(item => item.v)).toEqual(['a', 'A', 'b'])
  })

  it('applies multiple fields in priority order', () => {
    const items = [
      { a: 1, b: 2 },
      { a: 2, b: 1 },
      { a: 1, b: 1 },
    ]

    expect(sortItems(items, [
      { field: 'a', desc: false },
      { field: 'b', desc: true },
    ])).toEqual([
      { a: 1, b: 2 },
      { a: 1, b: 1 },
      { a: 2, b: 1 },
    ])
  })

  it('reads values through the readValue option', () => {
    const items = [{ nested: { v: 2 } }, { nested: { v: 1 } }]

    const sorted = sortItems(items, [{ field: 'v', desc: false }], {
      readValue: (item, field) => item.nested[field],
    })
    expect(sorted.map(item => item.nested.v)).toEqual([1, 2])
  })

  it('returns the same array when no sort fields are given', () => {
    const items = [{ v: 2 }, { v: 1 }]
    expect(sortItems(items, [])).toBe(items)
  })
})

describe('compareValues', () => {
  it('orders nulls after values', () => {
    expect(compareValues(null, 1)).toBe(1)
    expect(compareValues(1, null)).toBe(-1)
    expect(compareValues(null, undefined)).toBe(0)
  })

  it('orders numbers and strings', () => {
    expect(compareValues(1, 2)).toBeLessThan(0)
    expect(compareValues(2, 1)).toBeGreaterThan(0)
    expect(compareValues('a', 'b')).toBeLessThan(0)
    expect(compareValues(1, 1)).toBe(0)
  })
})

describe('normalizeSort', () => {
  it('accepts field names, string specifiers, and object specifiers', () => {
    expect(normalizeSort('title')).toEqual({
      supported: true,
      fields: [{ field: 'title', desc: false }],
    })
    expect(normalizeSort([{ title: 'desc' }, { id: { direction: 'asc' } }])).toEqual({
      supported: true,
      fields: [
        { field: 'title', desc: true },
        { field: 'id', desc: false },
      ],
    })
    expect(normalizeSort(null)).toEqual({ supported: true, fields: [] })
  })

  it('rejects invalid specifiers with dialect-prefixed reasons', () => {
    expect(normalizeSort(42, { dialectName: 'Monospace' })).toEqual({
      supported: false,
      reason: 'Monospace sort specifiers must be field names or objects',
    })
    expect(normalizeSort({ a: 'asc', b: 'desc' }, { dialectName: 'Monospace' })).toEqual({
      supported: false,
      reason: 'Monospace sort objects must have exactly one field',
    })
    expect(normalizeSort({ a: 42 })).toEqual({
      supported: false,
      reason: 'Invalid sort specifier for "a"',
    })
  })

  it('rejects explicit nulls placement', () => {
    expect(normalizeSort({ title: { direction: 'desc', nulls: 'first' } }, { dialectName: 'Monospace' })).toEqual({
      supported: false,
      reason: 'Monospace sort nulls placement cannot be evaluated cache-side',
    })
  })
})

describe('normalizeSortStrings', () => {
  it('parses the descending prefix', () => {
    expect(normalizeSortStrings(['title', '-date_created'])).toEqual([
      { field: 'title', desc: false },
      { field: 'date_created', desc: true },
    ])
  })

  it('accepts a single string and undefined', () => {
    expect(normalizeSortStrings('-title')).toEqual([{ field: 'title', desc: true }])
    expect(normalizeSortStrings(undefined)).toEqual([])
  })
})
