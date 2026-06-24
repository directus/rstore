import { describe, expect, it } from 'vitest'
import { getMutationItemKey, isMutationItemEntry, unwrapMutationItem } from '../../src/utils/mutation.js'

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
