import { describe, expect, it } from 'vitest'
import { defaultMarker, getMarker, resolveCollections } from '../src'

/** Resolves a collection through the same public schema boundary as a store. */
function collection(name = 'TestType') {
  return resolveCollections([{ name }])[0]!
}

describe('defaultMarker', () => {
  it('is stable for equivalent query inputs and scoped by collection', () => {
    const first = defaultMarker(collection(), { filter: { id: 1 }, sort: 'asc' } as any)
    const second = defaultMarker(collection(), { filter: { id: 1 }, sort: 'asc' } as any)

    expect(first).toBe(second)
    expect(defaultMarker(collection('Other'), { filter: { id: 1 }, sort: 'asc' } as any)).not.toBe(first)
  })

  it('distinguishes query parameters that can change returned rows', () => {
    const target = collection()

    expect(defaultMarker(target, { params: { page: 1 } } as any))
      .not
      .toBe(defaultMarker(target, { params: { page: 2 } } as any))
  })

  it('ignores fetch behavior that cannot change result identity', () => {
    const target = collection()
    const base = defaultMarker(target, { params: { page: 1 } } as any)

    expect(defaultMarker(target, {
      params: { page: 1 },
      fetchPolicy: 'cache-only',
      fetchOptions: { autoRefresh: 'manual' },
    } as any)).toBe(base)
  })

  it('omits function identity from transportable cache markers', () => {
    const target = collection()
    const base = defaultMarker(target, { params: { page: 1 } } as any)

    expect(defaultMarker(target, { params: { page: 1 }, filter: () => true })).toBe(base)
    expect(defaultMarker(target, { params: { page: 1 }, filter: () => false })).toBe(base)
  })
})

describe('getMarker', () => {
  it('keeps first and many result spaces separate without pinning encoding', () => {
    const marker = defaultMarker(collection())

    expect(getMarker('first', marker)).not.toBe(getMarker('many', marker))
    expect(getMarker('first', marker)).toBe(getMarker('first', marker))
  })
})
