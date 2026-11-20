import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectionBudget, ProjectionBudgetExceededError, projectValue } from '../src/projection'
import { fitString, jsonBytes } from '../src/projection/budget'

/** Pure boundary: real projector; independent expected previews reject retained sources and unsafe getters. */
describe('detached diagnostic value projection', () => {
  it('preserves supported values and treats source tags as application data', () => {
    expect(projectValue({ kind: 'date', value: 'application' }).value).toEqual({
      kind: 'object',
      entries: [['kind', 'date'], ['value', 'application']],
    })
    expect(projectValue(new Date('2026-10-08T00:00:00Z')).value).toEqual({ kind: 'date', value: '2026-10-08T00:00:00.000Z' })
    expect(projectValue(new Date(Number.NaN)).value).toEqual({ kind: 'date', value: null })
    expect(projectValue(123n).value).toEqual({ kind: 'bigint', value: '123' })
    expect(projectValue(new Map([['id', new Set([1, 2])]])).value).toEqual({
      kind: 'map',
      entries: [['id', { kind: 'set', values: [1, 2] }]],
    })
    expect(projectValue(() => {}).value).toMatchObject({ kind: 'function' })
    expect(projectValue(new Error('failure')).value).toMatchObject({ kind: 'error', name: 'Error', message: 'failure' })
  })

  it('detaches retained previews and preserves cycles and repeated unwrapped identity', () => {
    const child = { count: 1 }
    const source: Record<string, unknown> = { 'a/b': child, 'second': child }
    source.self = source
    const result = projectValue(source)
    child.count = 999
    expect(result.value).toEqual({ kind: 'object', entries: [
      ['a/b', { kind: 'object', entries: [['count', 1]] }],
      ['second', { kind: 'reference', path: '$/entries/0/1' }],
      ['self', { kind: 'reference', path: '$' }],
    ] })
    const wrapped = { wrapper: child }
    expect(projectValue([wrapped, child], { unwrap: value => value === wrapped ? child : value }).value).toEqual({ kind: 'array', values: [
      { kind: 'object', entries: [['count', 999]] },
      { kind: 'reference', path: '$/values/0' },
    ] })
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value)
  })

  it('does not invoke accessors or source serialization and isolates hostile reflection', () => {
    let calls = 0
    const source = {
      get secret() {
        calls++
        throw new Error('do not execute')
      },
      toJSON() {
        calls++
        throw new Error('do not serialize source')
      },
      safe: 42,
    }
    expect(projectValue(source).value).toMatchObject({ kind: 'object', entries: [
      ['secret', { kind: 'accessor', path: '$/entries/0/1' }],
      ['toJSON', { kind: 'function' }],
      ['safe', 42],
    ] })
    expect(calls).toBe(0)
    const hostile = new Proxy({}, {
      ownKeys() { throw new Error('blocked reflection') },
    })
    expect(projectValue({ hostile, safe: 42 }).value).toMatchObject({ kind: 'object', entries: [
      ['hostile', { kind: 'unsupported' }],
      ['safe', 42],
    ] })
  })

  it('bounds UTF-8, JSON escaping, depth and sibling traversal while reporting truncation', () => {
    const result = projectValue({ long: 'é😀\n'.repeat(20_000), tail: 1 }, { maxBytes: 256, maxStringBytes: 60 })
    expect(result.bytes).toBe(new TextEncoder().encode(JSON.stringify(result.value)).length)
    expect(result.bytes).toBeLessThanOrEqual(256)
    expect(result.truncated).toBe(true)
    expect(projectValue({ a: { b: { c: 1 } } }, { maxDepth: 1 }).truncated).toBe(true)
    let descriptors = 0
    const wide = new Proxy(Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`key${i}`, i])), {
      getOwnPropertyDescriptor(target, key) {
        descriptors++
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    const bounded = projectValue(wide, { maxEntries: 5 })
    expect(bounded.truncated).toBe(true)
    expect(descriptors).toBeLessThan(30)
  })

  it('shares total allowance across projections and refuses values after exhaustion', () => {
    const budget = createProjectionBudget(180)
    const first = projectValue('a'.repeat(100), { budget })
    const second = projectValue('b'.repeat(100), { budget })
    expect(first.value).toBe('a'.repeat(100))
    expect(second.truncated).toBe(true)
    expect(first.bytes + second.bytes).toBeLessThanOrEqual(180)
    expect(budget.consumedBytes).toBe(first.bytes + second.bytes)
    const tiny = createProjectionBudget(4)
    projectValue(null, { budget: tiny })
    expect(() => projectValue(null, { budget: tiny })).toThrow(ProjectionBudgetExceededError)
  })
})

/** Reference size: real UTF-8 encoding of the JSON text. */
function encodedJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/** Strings covering every JSON escape class and UTF-8 width, including lone surrogates. */
const TRICKY = ['', 'plain', '"quoted"', 'back\\slash', 'line\nbreak\ttab\r\b\f', '\u0001\u001F\u007F', 'é€', '😀🃏', '\uD800', 'a\uDC00b', '\u2028\u2029', 'mix é😀\n"\\\uD83D']

describe('projection byte accounting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('counts JSON UTF-8 bytes exactly like encoding the serialized text', () => {
    for (const value of TRICKY)
      expect(jsonBytes(value), JSON.stringify(value)).toBe(encodedJsonBytes(value))
    expect(jsonBytes({ kind: 'object', entries: [['k', TRICKY.join('')]] })).toBe(encodedJsonBytes({ kind: 'object', entries: [['k', TRICKY.join('')]] }))
  })

  it('fits strings to the largest whole-code-point prefix within the limit', () => {
    const source = TRICKY.join('').repeat(3)
    for (let limit = 2; limit < encodedJsonBytes(source) + 2; limit++) {
      const fitted = fitString(source, limit)
      expect(encodedJsonBytes(fitted.value)).toBeLessThanOrEqual(limit)
      expect(source.startsWith(fitted.value)).toBe(true)
      if (fitted.truncated) {
        // The next code point (lone surrogates count alone) would not have fit.
        const next = String.fromCodePoint(source.codePointAt(fitted.value.length)!)
        expect(encodedJsonBytes(fitted.value + next)).toBeGreaterThan(limit)
      }
      else {
        expect(fitted.value).toBe(source)
      }
    }
  })

  it('projects long strings without allocating an encoder per character', () => {
    // History records every cache write; per-character encoding froze apps for
    // seconds while hydrating large collections.
    let encoders = 0
    const RealEncoder = globalThis.TextEncoder
    vi.stubGlobal('TextEncoder', class extends RealEncoder {
      constructor() {
        super()
        encoders++
      }
    })
    projectValue({ text: 'card rules text é😀 '.repeat(2000) })
    expect(encoders).toBe(0)
  })
})
