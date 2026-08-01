import type { ResolvedCollection } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import { defaultMarker, getMarker } from '../src'

/**
 * Create a minimal resolved collection stub for marker tests.
 */
function createCollection(): ResolvedCollection {
  return {
    '~resolved': true,
    'hooks': undefined,
    'name': 'TestType',
    'computed': {},
    'fields': {},
    'getKey': () => '',
    'isInstanceOf': () => true,
    'relations': {},
    'formSchema': {} as any,
    'indexes': new Map(),
    'normalizedRelations': {},
    'oppositeRelations': {},
  }
}

describe('defaultMarker', () => {
  it('should generate marker with empty findOptions', () => {
    const result = defaultMarker(createCollection())
    expect(result).toBe('TestType:{}')
  })

  it('should generate marker with findOptions', () => {
    const findOptions = { filter: { id: 1 } }
    const result = defaultMarker(createCollection(), findOptions as any)
    expect(result).toBe('TestType:{"filter":{"id":1}}')
  })

  it('should generate marker with findOptions and non-function filter', () => {
    const findOptions = { filter: { id: 1 }, sort: 'asc' }
    const result = defaultMarker(createCollection(), findOptions as any)
    expect(result).toBe('TestType:{"filter":{"id":1},"sort":"asc"}')
  })

  it('should exclude fetchOptions from the marker', () => {
    const collection = createCollection()
    const result = defaultMarker(collection, { params: { foo: 'bar' }, fetchOptions: { autoRefresh: 'manual' } } as any)
    expect(result).toBe(defaultMarker(collection, { params: { foo: 'bar' } } as any))
  })

  it('should omit function options from the marker', () => {
    const collection = createCollection()
    // Markers must be identical across processes: they are computed during
    // SSR, serialized into the payload and recomputed on the client — no
    // function id survives that boundary (reference identity is
    // process-local and server/client bundles transform the same source
    // differently). A fresh closure per options-getter evaluation must not
    // mint a fresh marker either.
    const markerA = defaultMarker(collection, { filter: () => true, params: { foo: 'bar' } })
    const markerB = defaultMarker(collection, { filter: () => true, params: { foo: 'bar' } })
    const markerNoFilter = defaultMarker(collection, { params: { foo: 'bar' } })

    expect(markerA).toBe(markerB)
    expect(markerA).toBe(markerNoFilter)
  })
})

describe('getMarker', () => {
  it('should generate marker for first', () => {
    const result = getMarker('first', 'TestType:{}')
    expect(result).toBe('first:TestType:{}')
  })

  it('should generate marker for many', () => {
    const result = getMarker('many', 'TestType:{}')
    expect(result).toBe('many:TestType:{}')
  })
})
