import { createPlainDateTime, createZonedDateTime } from '#test-utils/temporal'
import { describe, expect, it } from 'vitest'
import { fieldValuesEqual } from '../../src'

describe('fieldValuesEqual', () => {
  it('should handle primitives', () => {
    expect(fieldValuesEqual(1, 1)).toBe(true)
    expect(fieldValuesEqual(1, 2)).toBe(false)
    expect(fieldValuesEqual('a', 'a')).toBe(true)
    expect(fieldValuesEqual('a', 'b')).toBe(false)
    expect(fieldValuesEqual(true, true)).toBe(true)
    expect(fieldValuesEqual(true, false)).toBe(false)
  })

  it('should handle null/undefined', () => {
    expect(fieldValuesEqual(null, null)).toBe(true)
    expect(fieldValuesEqual(undefined, undefined)).toBe(true)
    expect(fieldValuesEqual(null, undefined)).toBe(true)
    expect(fieldValuesEqual(null, 0)).toBe(false)
    expect(fieldValuesEqual(undefined, '')).toBe(false)
  })

  it('should compare objects by JSON', () => {
    expect(fieldValuesEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(fieldValuesEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(fieldValuesEqual([1, 2], [1, 2])).toBe(true)
    expect(fieldValuesEqual([1, 2], [2, 1])).toBe(false)
  })

  it('should handle type mismatches', () => {
    expect(fieldValuesEqual(1, '1')).toBe(false)
    expect(fieldValuesEqual(0, false)).toBe(false)
  })

  it('should treat NaN as equal to NaN', () => {
    expect(fieldValuesEqual(Number.NaN, Number.NaN)).toBe(true)
    expect(fieldValuesEqual(Number.NaN, 0)).toBe(false)
  })

  it('should be key-order independent for objects', () => {
    expect(fieldValuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(fieldValuesEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false)
  })

  it('should compare Date by time value', () => {
    expect(fieldValuesEqual(new Date(100), new Date(100))).toBe(true)
    expect(fieldValuesEqual(new Date(100), new Date(200))).toBe(false)
    expect(fieldValuesEqual(new Date('invalid'), new Date('invalid'))).toBe(true)
  })

  it('should compare Temporal-like values by their public equality protocol', () => {
    const plainInitial = createPlainDateTime('2026-07-07T22:25')
    const plainEqual = createPlainDateTime('2026-07-07T22:25')
    const plainChanged = createPlainDateTime('2026-07-07T22:30')
    const zonedInitial = createZonedDateTime('2026-07-07T22:25+02:00[Europe/Paris]')
    const zonedEqual = createZonedDateTime('2026-07-07T22:25+02:00[Europe/Paris]')
    const zonedChanged = createZonedDateTime('2026-07-07T22:30+02:00[Europe/Paris]')

    expect(Object.keys(plainInitial)).toEqual([])
    expect(fieldValuesEqual(plainInitial, plainEqual)).toBe(true)
    expect(fieldValuesEqual(plainInitial, plainChanged)).toBe(false)
    expect(fieldValuesEqual(zonedInitial, zonedEqual)).toBe(true)
    expect(fieldValuesEqual(zonedInitial, zonedChanged)).toBe(false)
    expect(fieldValuesEqual(plainInitial, zonedInitial)).toBe(false)
  })

  it('should compare Map by entries', () => {
    expect(fieldValuesEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
    expect(fieldValuesEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
    expect(fieldValuesEqual(new Map(), new Map([['a', 1]]))).toBe(false)
  })

  it('should compare Set by members', () => {
    expect(fieldValuesEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(fieldValuesEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
  })

  it('should not confuse different prototypes', () => {
    expect(fieldValuesEqual(new Date(0), { getTime: () => 0 } as any)).toBe(false)
    expect(fieldValuesEqual(new Map([['a', 1]]), [['a', 1]] as any)).toBe(false)
  })

  it('should tolerate cyclic references without throwing', () => {
    const a: any = {}
    const b: any = {}
    a.self = a
    b.self = b
    expect(() => fieldValuesEqual(a, b)).not.toThrow()
  })

  it('should consider array order significant', () => {
    expect(fieldValuesEqual([1, 2, 3], [3, 2, 1])).toBe(false)
  })

  it('should distinguish arrays from objects with numeric keys', () => {
    expect(fieldValuesEqual([1, 2], { 0: 1, 1: 2, length: 2 } as any)).toBe(false)
  })
})
