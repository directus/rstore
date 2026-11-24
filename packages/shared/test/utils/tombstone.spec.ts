import { describe, expect, it } from 'vitest'
import { isCacheTombstone } from '../../src'

describe('isCacheTombstone', () => {
  it('accepts serialized tombstone records', () => {
    expect(isCacheTombstone({ collection: 'todos', key: '1', deletedAt: 10 })).toBe(true)
  })

  it('rejects arrays and incomplete records', () => {
    expect(isCacheTombstone([])).toBe(false)
    expect(isCacheTombstone([{ collection: 'todos', key: '1', deletedAt: 10 }])).toBe(false)
    expect(isCacheTombstone({ collection: 'todos', key: '1' })).toBe(false)
  })
})
