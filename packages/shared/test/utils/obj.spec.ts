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
