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

  it('should not collide markers for queries with different function filters', () => {
    const collection = createCollection()
    const filterA = () => true
    const filterB = () => true
    const markerA = defaultMarker(collection, { filter: filterA, params: { foo: 'bar' } })
    const markerB = defaultMarker(collection, { filter: filterB, params: { foo: 'bar' } })
    const markerNoFilter = defaultMarker(collection, { params: { foo: 'bar' } })

    expect(markerA).not.toBe(markerB)
    expect(markerA).not.toBe(markerNoFilter)
    expect(markerB).not.toBe(markerNoFilter)
  })

  it('should generate a stable marker for the same function filter reference', () => {
    const collection = createCollection()
    const filter = () => true
    const marker1 = defaultMarker(collection, { filter, params: { foo: 'bar' } })
    const marker2 = defaultMarker(collection, { filter, params: { foo: 'bar' } })
    expect(marker1).toBe(marker2)
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
