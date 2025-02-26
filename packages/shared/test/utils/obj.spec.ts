import { describe, expect, it } from 'vitest'
import { get, pickNonSpecialProps, pickSpecialProps, set } from '../../src/utils/obj.js'

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

  it('should return an empty object if all properties start with $', () => {
    const obj = { $a: 1, $b: 2 }
    expect(pickNonSpecialProps(obj)).toEqual({})
  })

  it('should return the same object if no properties start with $', () => {
    const obj = { a: 1, b: 2 }
    expect(pickNonSpecialProps(obj)).toEqual({ a: 1, b: 2 })
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
