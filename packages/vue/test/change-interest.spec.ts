import { describe, expect, it } from 'vitest'
import { createCacheChangeInterestRegistry } from '../src/cache/changeInterest'

describe('cache change interest', () => {
  it('keeps exact item interest until duplicate owners release', () => {
    const interest = createCacheChangeInterestRegistry()

    interest.retainItem('Todo', 1)
    interest.retainItem('Todo', '1')
    interest.releaseItem('Todo', 1)

    expect(interest.wantsItem('Todo', '1')).toBe(true)
    interest.releaseItem('Todo', '1')
    expect(interest.wantsItem('Todo', '1')).toBe(false)
  })

  it('keeps exact index interest until duplicate owners release', () => {
    const interest = createCacheChangeInterestRegistry()

    interest.retainIndex('Todo', 'dependency')
    interest.retainIndex('Todo', 'dependency')
    interest.releaseIndex('Todo', 'dependency')

    expect(interest.wantsIndex('dependency')).toBe(true)
    interest.releaseIndex('Todo', 'dependency')
    expect(interest.wantsIndex('dependency')).toBe(false)
  })
})
