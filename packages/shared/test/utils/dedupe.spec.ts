import { describe, expect, it, vi } from 'vitest'
import { dedupePromise } from '../../src'

describe('dedupePromise', () => {
  it('should call the function and resolve the promise', async () => {
    const map = new Map<string, Promise<string>>()
    const fn = vi.fn(() => Promise.resolve('result'))

    const result = await dedupePromise(map, 'key1', fn)

    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should return the same promise for the same key', async () => {
    const map = new Map<string, Promise<string>>()
    const fn = vi.fn(() => Promise.resolve('result'))

    const promise1 = dedupePromise(map, 'key1', fn)
    const promise2 = dedupePromise(map, 'key1', fn)

    expect(promise1).toBe(promise2)
    expect(fn).toHaveBeenCalledTimes(1)

    const result = await promise1
    expect(result).toBe('result')
  })

  it('should remove the key from the map after the promise resolves', async () => {
    const map = new Map<string, Promise<string>>()
    const fn = vi.fn(() => Promise.resolve('result'))

    await dedupePromise(map, 'key1', fn)

    expect(map.has('key1')).toBe(false)
  })

  it('should remove the key from the map after the promise rejects', async () => {
    const map = new Map<string, Promise<string>>()
    const fn = () => Promise.reject(new Error('error'))

    await expect(dedupePromise(map, 'key1', fn)).rejects.toThrowError(/error/)

    expect(map.has('key1')).toBe(false)
  })

  it('should handle multiple keys independently', async () => {
    const map = new Map<string, Promise<string>>()
    const fn1 = vi.fn(() => Promise.resolve('result1'))
    const fn2 = vi.fn(() => Promise.resolve('result2'))

    const result1 = await dedupePromise(map, 'key1', fn1)
    const result2 = await dedupePromise(map, 'key2', fn2)

    expect(result1).toBe('result1')
    expect(result2).toBe('result2')
    expect(fn1).toHaveBeenCalledTimes(1)
    expect(fn2).toHaveBeenCalledTimes(1)
  })
})

describe('dedupePromise cleanup', () => {
  it.each(['catch', 'await'] as const)('retries immediately after rejection through %s', async (mode) => {
    const map = new Map<string, Promise<string>>()
    const error = new Error('offline')
    let attempts = 0
    /** Retry through the public utility without an assertion adding microtasks. */
    const request = () => dedupePromise(map, 'key1', () => ++attempts === 1
      ? Promise.reject(error)
      : Promise.resolve('recovered'))
    let result: string
    if (mode === 'catch') {
      result = await request().catch((caught) => {
        expect(caught).toBe(error)
        return request()
      })
    }
    else {
      try {
        await request()
      }
      catch (caught) {
        expect(caught).toBe(error)
      }
      result = await request()
    }
    expect(result).toBe('recovered')
    expect(attempts).toBe(2)
  })

  it('should have cleared the entry by the time the deduped promise resolves', async () => {
    const map = new Map<string, Promise<string>>()
    const fn = vi.fn(() => Promise.resolve('result'))

    const first = dedupePromise(map, 'key1', fn)
    const second = await first.then(() => dedupePromise(map, 'key1', fn))

    // The cleanup handler is attached before any caller can chain onto the
    // promise, so a request made in a `.then` starts a fresh run.
    expect(second).toBe('result')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should leave no entry behind when the factory throws synchronously', () => {
    const map = new Map<string, Promise<string>>()

    expect(() => dedupePromise(map, 'key1', () => {
      throw new Error('sync boom')
    })).toThrowError(/sync boom/)

    expect(map.has('key1')).toBe(false)
  })

  it('should ignore the factory of a later call for a key already in flight', async () => {
    const map = new Map<string, Promise<string>>()
    const first = vi.fn(() => Promise.resolve('first'))
    const second = vi.fn(() => Promise.resolve('second'))

    const promise = dedupePromise(map, 'key1', first)
    const deduped = dedupePromise(map, 'key1', second)

    expect(await deduped).toBe('first')
    expect(second).not.toHaveBeenCalled()
    expect(await promise).toBe('first')
  })

  it('should never share a promise between two keys', async () => {
    const map = new Map<string, Promise<string>>()
    const fn = vi.fn((value: string) => Promise.resolve(value))

    const a = dedupePromise(map, 'key1', () => fn('a'))
    const b = dedupePromise(map, 'key2', () => fn('b'))

    expect(a).not.toBe(b)
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
  })
})
