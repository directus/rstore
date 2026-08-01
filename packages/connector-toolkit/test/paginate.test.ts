import { describe, expect, it } from 'vitest'
import { paginateItems } from '../src'

const items = [1, 2, 3, 4, 5]

describe('paginateItems', () => {
  it('returns items untouched without a query', () => {
    expect(paginateItems(items, undefined)).toBe(items)
  })

  it('applies limit and offset', () => {
    expect(paginateItems(items, { limit: 2 })).toEqual([1, 2])
    expect(paginateItems(items, { offset: 2 })).toEqual([3, 4, 5])
    expect(paginateItems(items, { limit: 2, offset: 1 })).toEqual([2, 3])
  })

  it('treats limit 0 and negative limits as literal without unlimitedSentinels', () => {
    expect(paginateItems(items, { limit: 0 })).toEqual([])
    // Literal negative limits keep raw slice semantics (Directus behavior).
    expect(paginateItems(items, { limit: -1 })).toEqual([1, 2, 3, 4])
  })

  it('treats limit 0 and -1 as unlimited with unlimitedSentinels', () => {
    expect(paginateItems(items, { limit: 0 }, { unlimitedSentinels: true })).toEqual(items)
    expect(paginateItems(items, { limit: -1, offset: 2 }, { unlimitedSentinels: true })).toEqual([3, 4, 5])
  })

  it('ignores the page option without supportsPage', () => {
    expect(paginateItems(items, { limit: 2, page: 2 })).toEqual([1, 2])
  })

  it('maps the 1-based page option with supportsPage', () => {
    expect(paginateItems(items, { limit: 2, page: 2 }, { supportsPage: true })).toEqual([3, 4])
    // Page 0 and 1 clamp to the first page.
    expect(paginateItems(items, { limit: 2, page: 0 }, { supportsPage: true })).toEqual([1, 2])
    expect(paginateItems(items, { limit: 2, page: 1 }, { supportsPage: true })).toEqual([1, 2])
    // Page without limit falls back to no offset.
    expect(paginateItems(items, { page: 3 }, { supportsPage: true })).toEqual(items)
  })

  it('prefers explicit offset over page', () => {
    expect(paginateItems(items, { limit: 2, offset: 0, page: 3 }, { supportsPage: true })).toEqual([1, 2])
  })
})
