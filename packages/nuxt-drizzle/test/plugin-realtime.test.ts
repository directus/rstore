import { stringifyHLC } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { maxPayloadStamp, stampToDate } from '../src/runtime/utils/realtime-stamps'

function hlc(physical: number, logical = 0, nodeId = 'test'): string {
  return stringifyHLC({ physical, logical, nodeId })
}

// The plugin-realtime module itself is a Nuxt-bound wiring layer (`useWebSocket`,
// `#build/...` virtual imports) that is cumbersome to instantiate in a unit
// test environment. The pieces that have interesting logic — HLC
// aggregation on incoming frames and HLC → Date conversion for sync hooks —
// live in `realtime-stamps.ts` and are covered here.

describe('maxPayloadStamp', () => {
  it('returns deletedAt for a deleted payload', () => {
    const deletedAt = hlc(1700000000000, 0, 'n1')
    const stamp = maxPayloadStamp({
      type: 'deleted',
      collection: 'todos',
      key: '1',
      record: undefined as any,
      deletedAt,
    })
    expect(stamp).toBe(deletedAt)
  })

  it('returns the highest HLC across fieldTimestamps', () => {
    const a1 = hlc(1700000000000, 1, 'a')
    const b3 = hlc(1700000000000, 3, 'b')
    const a2 = hlc(1700000000000, 2, 'a')
    const stamp = maxPayloadStamp({
      type: 'updated',
      collection: 'todos',
      key: '1',
      record: { id: 1 },
      fieldTimestamps: {
        title: a1,
        done: b3,
        priority: a2,
      },
    })
    expect(stamp).toBe(b3)
  })

  it('returns undefined when no timestamps are attached (v1 payloads)', () => {
    const stamp = maxPayloadStamp({
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
    })
    expect(stamp).toBeUndefined()
  })
})

describe('stampToDate', () => {
  it('converts a numeric stamp to Date', () => {
    const d = stampToDate(1700000000000)
    expect(d.getTime()).toBe(1700000000000)
  })

  it('parses an HLC string to its physical component', () => {
    const d = stampToDate(hlc(1700000000000, 1, 'node'))
    expect(d.getTime()).toBe(1700000000000)
  })

  it('falls back to now() on malformed input', () => {
    const before = Date.now()
    const d = stampToDate('not-an-hlc')
    const after = Date.now()
    expect(d.getTime()).toBeGreaterThanOrEqual(before)
    expect(d.getTime()).toBeLessThanOrEqual(after)
  })
})
