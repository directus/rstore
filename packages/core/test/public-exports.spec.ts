import { describe, expect, it } from 'vitest'
import {
  compareHLC,
  createHLCClock,
  diffText,
  fieldValuesEqual,
  mergeText,
  stringifyHLC,
} from '../src'

describe('public core exports', () => {
  it('exports HLC helpers from the package root', () => {
    const clock = createHLCClock('node-a')
    const timestamp = clock.now()

    expect(stringifyHLC(timestamp)).toContain('node-a')
    expect(compareHLC(timestamp, timestamp)).toBe(0)
  })

  it('exports CRDT helpers from the package root', () => {
    expect(fieldValuesEqual({ a: [1] }, { a: [1] })).toBe(true)
    expect(diffText('ab', 'acb')).toEqual([{ index: 1, deleteCount: 0, insertText: 'c' }])
    expect(mergeText('a', 'ab', 'ac').conflicts).toEqual([])
  })
})
