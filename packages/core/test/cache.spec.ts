import type { ResolvedModelType } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import { defaultMarker, getMarker } from '../src'

describe('defaultMarker', () => {
  it('should generate marker with empty findOptions', () => {
    const type: ResolvedModelType<any, any> = {
      name: 'TestType',
      computed: {},
      fields: {},
      getKey: () => '',
      relations: [],
    }
    const result = defaultMarker(type)
    expect(result).toBe('TestType:{}:{}')
  })

  it('should generate marker with findOptions', () => {
    const type: ResolvedModelType<any, any> = {
      name: 'TestType',
      computed: {},
      fields: {},
      getKey: () => '',
      relations: [],
    }
    const findOptions = { filter: { id: 1 } }
    const result = defaultMarker(type, findOptions as any)
    expect(result).toBe('TestType:{"filter":{"id":1}}:{"id":1}')
  })

  it('should generate marker with findOptions and non-function filter', () => {
    const type: ResolvedModelType<any, any> = {
      name: 'TestType',
      computed: {},
      fields: {},
      getKey: () => '',
      relations: [],
    }
    const findOptions = { filter: { id: 1 }, sort: 'asc' }
    const result = defaultMarker(type, findOptions as any)
    expect(result).toBe('TestType:{"filter":{"id":1},"sort":"asc"}:{"id":1}')
  })

  it('should generate marker with findOptions and function filter and params', () => {
    const type: ResolvedModelType<any, any> = {
      name: 'TestType',
      computed: {},
      fields: {},
      getKey: () => '',
      relations: [],
    }
    const findOptions = { filter: () => true, params: { foo: 'bar' } }
    const result = defaultMarker(type, findOptions)
    expect(result).toBe('TestType:{"params":{"foo":"bar"}}:{}')
  })
})

describe('getMarker', () => {
  it('should generate marker for first', () => {
    const result = getMarker('first', 'TestType:{}:{}')
    expect(result).toBe('first:TestType:{}:{}')
  })

  it('should generate marker for many', () => {
    const result = getMarker('many', 'TestType:{}:{}')
    expect(result).toBe('many:TestType:{}:{}')
  })
})
