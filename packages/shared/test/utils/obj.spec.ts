import { klona } from 'klona'
import { describe, expect, it } from 'vitest'
import { get, isPublicKey, pickNonSpecialProps, pickSpecialProps, set } from '../../src'

describe('get', () => {
  it('should return the value at the given path', () => {
    const obj = { a: { b: { c: 42 } } }
    expect(get(obj, 'a.b.c')).toBe(42)
  })

  it('should return undefined for non-existent path', () => {
    const obj = { a: { b: { c: 42 } } }
    // @ts-expect-error testing non-existent path
    expect(get(obj, 'a.b.d')).toBeUndefined()
  })

  it('should return undefined for null or undefined object', () => {
    // @ts-expect-error testing non-existent path
    expect(get(null, 'a.b.c')).toBeUndefined()
    // @ts-expect-error testing non-existent path
    expect(get(undefined, 'a.b.c')).toBeUndefined()
  })
})

describe('set', () => {
  it('should set the value at the given path', () => {
    const obj = { a: { b: { c: 42 } } }
    set(obj, 'a.b.c', 100)
    expect(obj.a.b.c).toBe(100)
  })

  it('should create nested objects if they do not exist', () => {
    const obj: any = {}
    set(obj, 'a.b.c', 42)
    expect(obj.a.b.c).toBe(42)
  })

  it('should overwrite existing values', () => {
    const obj = { a: { b: { c: 42 } } }
    set(obj, 'a.b.c', 100)
    expect(obj.a.b.c).toBe(100)
  })
})

describe('pickNonSpecialProps', () => {
  it('should pick properties not starting with $', () => {
    const obj = { a: 1, b: 2, $c: 3, $d: 4 }
    expect(pickNonSpecialProps(obj)).toEqual({ a: 1, b: 2 })
  })

  it('should ignore internal relation data starting with _$', () => {
    const obj = { a: 1, _$relationData: { connect: () => {} } }

    expect(pickNonSpecialProps(obj, true)).toEqual({ a: 1 })
  })

  it('should return an empty object if all properties start with $', () => {
    const obj = { $a: 1, $b: 2 }
    expect(pickNonSpecialProps(obj)).toEqual({})
  })

  it('should return the same object if no properties start with $', () => {
    const obj = { a: 1, b: 2 }
    expect(pickNonSpecialProps(obj)).toEqual({ a: 1, b: 2 })
  })

  it('deeply detaches supported mutable values while preserving their kinds', () => {
    class PayloadValue {
      /** Create one custom payload value. */
      constructor(public value: string) {}
    }

    const source = {
      nested: { label: 'before' },
      list: [{ value: 1 }],
      map: new Map([['entry', { value: 2 }]]),
      set: new Set([{ value: 3 }]),
      date: new Date('2026-01-01T00:00:00.000Z'),
      regexp: /payload/gi,
      bytes: new Uint8Array([1, 2, 3]),
      custom: new PayloadValue('before'),
      $private: { retained: false },
    }

    const result = pickNonSpecialProps(source, true)
    source.nested.label = 'after'
    source.list[0]!.value = 9
    source.map.get('entry')!.value = 9
    ;[...source.set][0]!.value = 9
    source.bytes[0] = 9
    source.custom.value = 'after'

    expect(result).toMatchObject({
      nested: { label: 'before' },
      list: [{ value: 1 }],
      date: new Date('2026-01-01T00:00:00.000Z'),
      regexp: /payload/gi,
      custom: { value: 'before' },
    })
    expect(result.map.get('entry')).toEqual({ value: 2 })
    expect([...result.set]).toEqual([{ value: 3 }])
    expect([...result.bytes]).toEqual([1, 2, 3])
    expect(result.custom).toBeInstanceOf(PayloadValue)
    expect(result).not.toHaveProperty('$private')
  })

  it('retains primitive-only clone semantics without sharing the root object', () => {
    const source = { id: 1, title: 'wide', active: true, empty: null }
    const result = pickNonSpecialProps(source, true)

    expect(result).toEqual(source)
    expect(result).not.toBe(source)
  })

  it('matches historical klona behavior for every supported payload kind', () => {
    class CustomPayload {
      /** Create one prototype-bearing payload. */
      constructor(public nested = { value: 1 }) {}
    }
    const protoValue = Object.create(null)
    Object.defineProperty(protoValue, '__proto__', { value: { safe: true }, enumerable: true })
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer
    const source = Object.freeze({
      array: [{ value: 1 }],
      custom: new CustomPayload(),
      map: new Map<any, any>([[{ key: 1 }, { value: 2 }]]),
      set: new Set([{ value: 3 }]),
      date: new Date('2026-02-03T04:05:06.000Z'),
      regexp: Object.assign(/clone/gi, { lastIndex: 2 }),
      buffer,
      view: new DataView(buffer),
      typed: new Uint16Array([4, 5]),
      protoValue,
      $private: { ignored: true },
    })
    const expected = Object.fromEntries(Object.entries(source)
      .filter(([key]) => !key.startsWith('$'))
      .map(([key, value]) => [key, klona(value)]))
    const result = pickNonSpecialProps(source, true)

    expect(result).toEqual(expected)
    expect(result.custom).toBeInstanceOf(CustomPayload)
    expect(Object.getOwnPropertyDescriptor(result.protoValue, '__proto__')?.value).toEqual({ safe: true })
    expect(result.array).not.toBe(source.array)
    expect(result.map).not.toBe(source.map)
    expect(result.buffer).not.toBe(source.buffer)
  })

  it('preserves clone construction failures and resets clone state', () => {
    class RequiredArgument {
      /** Reject klona-style zero-argument construction. */
      constructor(value?: string) {
        if (value === undefined)
          throw new Error('required payload argument')
      }
    }
    const source = { nested: new RequiredArgument('value') }

    expect(() => klona(source.nested)).toThrow('required payload argument')
    expect(() => pickNonSpecialProps(source, true)).toThrow('required payload argument')
  })
})

describe('isPublicKey', () => {
  it('should allow non-internal string keys', () => {
    expect(isPublicKey('title')).toBe(true)
  })

  it('should reject rstore private string keys', () => {
    expect(isPublicKey('$loading')).toBe(false)
    expect(isPublicKey('_$relationData')).toBe(false)
  })

  it('should allow symbol and number keys', () => {
    expect(isPublicKey(Symbol('field'))).toBe(true)
    expect(isPublicKey(1)).toBe(true)
  })
})

describe('pickSpecialProps', () => {
  it('should pick properties starting with $', () => {
    const obj = { a: 1, b: 2, $c: 3, $d: 4 }
    expect(pickSpecialProps(obj)).toEqual({ $c: 3, $d: 4 })
  })

  it('should return an empty object if no properties start with $', () => {
    const obj = { a: 1, b: 2 }
    expect(pickSpecialProps(obj)).toEqual({})
  })

  it('should return the same object if all properties start with $', () => {
    const obj = { $a: 1, $b: 2 }
    expect(pickSpecialProps(obj)).toEqual({ $a: 1, $b: 2 })
  })
})

describe('set prototype safety', () => {
  it('should not pollute Object.prototype through a __proto__ path segment (field paths are user data)', () => {
    const target: Record<string, any> = {}
    try {
      set(target, '__proto__.polluted' as any, 'yes' as never)

      expect(({} as any).polluted).toBeUndefined()
      expect(target.polluted).toBeUndefined()
    }
    finally {
      delete (Object.prototype as any).polluted
    }
  })

  it('should not pollute Object.prototype through a constructor path segment (reachable from mutation/update.ts field paths)', () => {
    const target: Record<string, any> = {}
    try {
      set(target, 'constructor.prototype.polluted' as any, 'yes' as never)

      expect(({} as any).polluted).toBeUndefined()
    }
    finally {
      delete (Object.prototype as any).polluted
    }
  })
})

describe('set intermediate segments', () => {
  it('should create a plain object for a numeric segment instead of an array', () => {
    const obj: Record<string, any> = {}

    set(obj, 'a.0.b' as any, 42 as never)

    // Documented shape: `set` never infers an array from a numeric segment, so
    // a field path like `items.0.title` produces `{ '0': { title } }`.
    expect(Array.isArray(obj.a)).toBe(false)
    expect(obj.a).toEqual({ 0: { b: 42 } })
  })

  it('should replace a null intermediate with an object', () => {
    const obj: Record<string, any> = { a: null }

    set(obj, 'a.b' as any, 1 as never)

    expect(obj.a).toEqual({ b: 1 })
  })
})

describe('get edge paths', () => {
  it('should return undefined when the path crosses a null value', () => {
    expect(get({ a: null } as any, 'a.b' as any)).toBeUndefined()
    expect(get({ a: { b: undefined } } as any, 'a.b.c' as any)).toBeUndefined()
  })

  it('should read through a primitive instead of stopping at it', () => {
    // Only `null`/`undefined` short-circuit, so a path crossing a string keeps
    // walking and resolves the string's own properties.
    expect(get({ a: 'text' } as any, 'a.length' as any)).toBe(4)
    expect(get({ a: 'text' } as any, 'a.b' as any)).toBeUndefined()
    expect(get({ a: 1 } as any, 'a.b' as any)).toBeUndefined()
  })

  it('should propagate an error thrown by a getter on the path', () => {
    const obj = {
      get a(): { b: number } {
        throw new Error('getter exploded')
      },
    }

    expect(() => get(obj as any, 'a.b' as any)).toThrowError(/getter exploded/)
  })
})

describe('isPublicKey edges', () => {
  it('should classify prefixed string keys', () => {
    expect(isPublicKey('$')).toBe(false)
    expect(isPublicKey('_$')).toBe(false)
    expect(isPublicKey('_private')).toBe(true)
    expect(isPublicKey('')).toBe(true)
  })

  it('should never reject a non-string key', () => {
    const symbol = Symbol('$loading')
    expect(isPublicKey(symbol)).toBe(true)
    expect(isPublicKey(0)).toBe(true)
  })
})

describe('pickNonSpecialProps cloning', () => {
  it('should detach nested values when cloning', () => {
    const source = { nested: { list: [1, 2] }, date: new Date(1000) }

    const copy = pickNonSpecialProps(source, true)
    source.nested.list.push(3)

    expect(copy.nested).not.toBe(source.nested)
    expect(copy.nested.list).toEqual([1, 2])
    expect(copy.date).toEqual(new Date(1000))
    expect(copy.date).not.toBe(source.date)
  })

  it('should keep references when not cloning', () => {
    const source = { nested: { list: [1, 2] } }

    const copy = pickNonSpecialProps(source)
    source.nested.list.push(3)

    expect(copy.nested).toBe(source.nested)
    expect(copy.nested.list).toEqual([1, 2, 3])
  })
})
