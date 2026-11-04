import type { CacheChangeInterestRegistry } from '../src/cache/changeInterest'
import { describe, expect, it, vi } from 'vitest'
import { createIndexResultCache } from '../src/cache/indexResultCache'

/** Create only interest methods consumed by index-result cache. */
function createInterest(): CacheChangeInterestRegistry {
  return {
    retainIndex: vi.fn(),
    releaseIndex: vi.fn(),
  } as unknown as CacheChangeInterestRegistry
}

describe('index result cache', () => {
  it('reports whether caller must copy a cache-owned result', () => {
    const cache = createIndexResultCache(createInterest())

    expect(cache.set('Event', 'tiny', [{}])).toBe(false)
    expect(cache.set('Event', 'cached', Array.from({ length: 8 }, () => ({})))).toBe(true)
  })

  it('bounds retained entries and wrapper references while releasing interests', () => {
    const interest = createInterest()
    const cache = createIndexResultCache(interest)

    for (let index = 0; index < 130; index++)
      cache.set('Event', `dependency-${index}`, Array.from({ length: 8 }, () => ({ index })))

    expect(cache.size()).toEqual({ entries: 128, wrapperReferences: 1024 })
    expect(interest.releaseIndex).toHaveBeenCalledTimes(2)

    cache.set('Event', 'oversized', Array.from({ length: 20_001 }))
    expect(cache.size()).toEqual({ entries: 128, wrapperReferences: 1024 })
    cache.dispose()
    expect(interest.releaseIndex).toHaveBeenCalledTimes(130)
  })
})
