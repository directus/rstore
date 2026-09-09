import { describe, expect, it } from 'vitest'
import { todo } from '../../src'

describe('todo', () => {
  it('reports the missing implementation with its public context', () => {
    expect(() => todo('load profile')).toThrow('Not implemented: load profile')
  })
})
