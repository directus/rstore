import { describe, expect, it } from 'vitest'
import {
  compareHLC,
  createHLCClock,
  createStoreEngine,
  diffText,
  fieldValuesEqual,
  mergeText,
  stringifyHLC,
} from '../src'
import * as core from '../src'

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

  it('exports the supported engine without internal machinery', () => {
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: () => undefined,
        resolveChildCollection: () => null,
      },
    })

    expect(typeof createStoreEngine).toBe('function')
    expect(core).not.toHaveProperty('createObserverRegistry')
    expect(core).not.toHaveProperty('getVisibleKeys')
    expect(core).not.toHaveProperty('getIndexBucket')
    expect(core).not.toHaveProperty('resolveItem')
    expect(engine).not.toHaveProperty('_ctx')
    expect(engine).not.toHaveProperty('_getLayers')
    expect(engine).not.toHaveProperty('_getQueryMeta')
    expect(typeof engine.getQueryMeta).toBe('function')
    // @ts-expect-error engine context is intentionally private
    expect(engine._ctx).toBeUndefined()
    engine.dispose()
  })
})
