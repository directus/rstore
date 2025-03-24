import { describe, expect, it, vi } from 'vitest'
import { dedupePromise } from '../../src/utils/dedupe'

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
