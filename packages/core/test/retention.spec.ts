import { describe, expect, it } from 'vitest'
import { resolveRetention, selectEvictions } from '../src'

describe('retention', () => {
  it('fills omitted limits from defaults and keeps `false` as never evicting', () => {
    const defaults = { ttlMs: 1_000, maxSize: 10 }
    expect(resolveRetention(undefined, defaults)).toEqual(defaults)
    expect(resolveRetention({ maxSize: 3 }, defaults)).toEqual({ ttlMs: 1_000, maxSize: 3 })
    expect(resolveRetention({ ttlMs: Infinity }, defaults)).toEqual({ ttlMs: Infinity, maxSize: 10 })
    expect(resolveRetention(false, defaults)).toBe(false)
  })

  it('rejects limits that cannot bound anything', () => {
    const defaults = { ttlMs: 1_000, maxSize: 10 }
    expect(() => resolveRetention({ ttlMs: 0 }, defaults)).toThrow('ttlMs must be > 0 (received 0)')
    expect(() => resolveRetention({ maxSize: -1 }, defaults)).toThrow('maxSize must be an integer >= 0 (received -1)')
    expect(() => resolveRetention({ maxSize: Number.NaN }, defaults)).toThrow('maxSize must be an integer >= 0 (received NaN)')
  })

  it('evicts entries last used at or before the TTL cutoff, whatever the size limit', () => {
    const usedAt = new Map([['expired', 0], ['boundary', 500], ['recent', 501]])

    expect(selectEvictions(usedAt, { ttlMs: 500, maxSize: Infinity }, 1_000)).toEqual(['expired', 'boundary'])
  })

  it('evicts the least recently used entries beyond the size limit, whatever their age', () => {
    const usedAt = new Map([['c', 700], ['a', 100], ['b', 500]])

    expect(selectEvictions(usedAt, { ttlMs: Infinity, maxSize: 1 }, 1_000)).toEqual(['a', 'b'])
    expect(selectEvictions(usedAt, { ttlMs: Infinity, maxSize: 0 }, 1_000)).toEqual(['a', 'b', 'c'])
    expect(selectEvictions(usedAt, { ttlMs: Infinity, maxSize: Infinity }, 1_000)).toEqual([])
  })
})
