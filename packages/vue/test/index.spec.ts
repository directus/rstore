import { describe, expect, it } from 'vitest'
import { foo } from '../src/index.js'

describe('test', () => {
  it('works', () => {
    expect(foo).toBe('bar')
  })
})
