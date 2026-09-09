import { describe, expect, it } from 'vitest'
import { getMutationItemKey, isMutationItemEntry, unwrapMutationItem } from '../../src'

describe('mutation item helpers', () => {
  it('should identify mutation item entries', () => {
    expect(isMutationItemEntry({ key: 1, item: { id: 1 } })).toBe(true)
    expect(isMutationItemEntry({ item: { id: 1 } })).toBe(true)
    expect(isMutationItemEntry({ id: 1 })).toBe(false)
  })

  it('should unwrap mutation item entries and keep plain items', () => {
    const item = { id: 1 }

    expect(unwrapMutationItem({ key: 1, item })).toBe(item)
    expect(unwrapMutationItem(item)).toBe(item)
  })

  it('should return explicit keys from mutation item entries', () => {
    expect(getMutationItemKey({ key: 1, item: { id: 1 } })).toBe(1)
    expect(getMutationItemKey({ item: { id: 1 } })).toBeUndefined()
    expect(getMutationItemKey({ id: 1 })).toBeUndefined()
  })
})

describe('isMutationItemEntry shapes', () => {
  it('should reject values that cannot be entries', () => {
    expect(isMutationItemEntry(null)).toBe(false)
    expect(isMutationItemEntry(undefined)).toBe(false)
    expect(isMutationItemEntry('item')).toBe(false)
    expect(isMutationItemEntry([{ item: 1 }])).toBe(false)
    expect(isMutationItemEntry({ item: 1, title: 'x' })).toBe(false)
  })

  it('should treat a class instance with a single item field as an entry', () => {
    class Row {
      item = 'value'
    }

    // `mutation.ts:3` only looks at own keys, so a class instance is not
    // special-cased either.
    expect(isMutationItemEntry(new Row())).toBe(true)
  })

  it('misreads a collection item whose only field is `item` (known limitation of the single-key heuristic in mutation.ts:3)', () => {
    const realItem = { item: 'Buy milk' }

    // The mutation APIs accept user data here, so an item whose only field is
    // named `item` is silently unwrapped to its field value. Pinned so that
    // disambiguating the entry shape becomes a deliberate change.
    expect(isMutationItemEntry(realItem)).toBe(true)
    expect(unwrapMutationItem(realItem)).toBe('Buy milk')
  })
})

describe('getMutationItemKey edges', () => {
  it('should keep falsy keys carried by an entry', () => {
    const item = { id: 1 }

    expect(getMutationItemKey({ key: 0, item })).toBe(0)
    expect(getMutationItemKey({ key: '', item })).toBe('')
  })

  it('should return undefined rather than null for a plain item', () => {
    const key = getMutationItemKey({ id: 1, title: 'x' })

    // Callers branch on `key === undefined`; returning `null` would make a
    // keyless mutation look like a keyed one.
    expect(key).toBeUndefined()
    expect(key).not.toBeNull()
  })
})
