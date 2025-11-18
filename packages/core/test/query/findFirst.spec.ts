import type { Collection, CollectionDefaults, ResolvedCollection, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findFirst } from '../../src/query/findFirst'

interface TestCollectionDefaults extends CollectionDefaults {
  name: string
}

interface TestCollectionType extends Collection {
  id: string
}

vi.mock('../../src/query/peekFirst', () => ({
  peekFirst: vi.fn(({ findOptions }) => {
    if (typeof findOptions !== 'string' && findOptions.key === '1') {
      return { result: { id: '1', name: 'Test Item' }, marker: 'marker-1' }
    }
    if (typeof findOptions?.filter === 'function' && findOptions.filter?.({ id: '2', name: 'Test Item 2' })) {
      return { result: { id: '2', name: 'Test Item 2' }, marker: 'marker-2' }
    }
    return { result: null, marker: undefined }
  }),
}))

describe('findFirst', () => {
  let mockStore: StoreCore<any, any>
  let collection: ResolvedCollection

  beforeEach(() => {
    mockStore = {
      $cache: {
        readItem: ({ key }: any) => ({ id: key, name: 'Test Item' }),
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
        writeItem: vi.fn(),
        wrapItem: vi.fn(({ item }: any) => {
          return new Proxy(item, {
            get: (target, key) => {
              if (key === '$meta') {
                return {
                  queries: new Set(),
                  dirtyQueries: new Set(),
                }
              }
              return Reflect.get(target, key)
            },
          })
        }),
      },
      $hooks: createHooks(),
      $getFetchPolicy: () => 'cache-first',
      $processItemParsing: vi.fn(),
      $dedupePromises: new Map(),
    } as any

    collection = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return the first item from the cache by key', async () => {
    const result = await findFirst({
      store: mockStore,
      collection,
      findOptions: '1',
    })

    expect(result.result).toEqual({ id: '1', name: 'Test Item' })
  })

  it('should return the first item from the cache by filter', async () => {
    const result = await findFirst({
      store: mockStore,
      collection,
      findOptions: {
        filter: (item: WrappedItem<TestCollectionType, TestCollectionDefaults, any>) => item.id === '2',
      },
    })

    expect(result.result).toEqual({ id: '2', name: 'Test Item 2' })
  })

  it('should return null if no item matches the filter', async () => {
    const result = await findFirst({
      store: mockStore,
      collection,
      findOptions: {
        filter: (item: WrappedItem<TestCollectionType, TestCollectionDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toBeNull()
  })

  it('should call hooks with correct context', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')

    await findFirst({
      store: mockStore,
      collection,
      findOptions: '42',
    })

    expect(callHookSpy).toHaveBeenCalledWith('fetchFirst', expect.any(Object))
  })

  it('should write item to cache if fetch policy allows', async () => {
    mockStore.$getFetchPolicy = () => 'cache-and-fetch'
    mockStore.$hooks.hook('fetchFirst', (payload) => {
      payload.setResult({ id: '42' })
    })

    const result = await findFirst({
      store: mockStore,
      collection,
      findOptions: '42',
    })

    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith(expect.objectContaining({
      collection,
      key: '42',
      item: result.result,
    }))
  })

  it('should not write item to cache if fetch policy is no-cache', async () => {
    mockStore.$getFetchPolicy = () => 'no-cache'
    mockStore.$hooks.hook('fetchFirst', (payload) => {
      payload.setResult({ id: '1' })
    })
    await findFirst({
      store: mockStore,
      collection,
      findOptions: '1',
    })

    expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
  })

  it('should wrap item with noCache if fetch policy is no-cache', async () => {
    mockStore.$getFetchPolicy = () => 'no-cache'
    mockStore.$hooks.hook('fetchFirst', (payload) => {
      payload.setResult({ id: '1' })
    })

    await findFirst({
      store: mockStore,
      collection,
      findOptions: '1',
    })

    expect(mockStore.$cache.wrapItem).toHaveBeenCalledOnce()
    expect(mockStore.$cache.wrapItem).toHaveBeenCalledWith(expect.objectContaining({
      noCache: true,
    }))
  })

  describe('should dedupe finds', () => {
    it('should dedupe findFirst on key', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: 'bar' })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          collection,
          findOptions: '42',
        }),
        findFirst({
          store: mockStore,
          collection,
          findOptions: '42',
        }),
      ])

      expect(fn).toHaveBeenCalledOnce()
      expect(result.map(r => r.result)).toEqual([
        { foo: 'bar' },
        { foo: 'bar' },
      ])
    })

    it('should not dedupe findFirst on different collection', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: payload.findOptions.key })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          collection,
          findOptions: '42',
        }),
        findFirst({
          store: mockStore,
          collection: {
            ...collection,
            name: 'Other',
          },
          findOptions: '42',
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.map(r => r.result)).toEqual([
        { foo: '42' },
        { foo: '42' },
      ])
    })

    it('should not dedupe findFirst on different key', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: payload.findOptions.key })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          collection,
          findOptions: '42',
        }),
        findFirst({
          store: mockStore,
          collection,
          findOptions: '43',
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.map(r => r.result)).toEqual([
        { foo: '42' },
        { foo: '43' },
      ])
    })

    it('should dedupe findFirst on findOptions', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: 'bar' })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
      ])

      expect(fn).toHaveBeenCalledOnce()
      expect(result.map(r => r.result)).toEqual([
        { foo: 'bar' },
        { foo: 'bar' },
      ])
    })

    it('should not dedupe findFirst on different findOptions', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: payload.findOptions.filter.id.eq })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: { id: { eq: '43' } } },
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.map(r => r.result)).toEqual([
        { foo: '42' },
        { foo: '43' },
      ])
    })

    it('should ignore filter function', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: payload.findOptions.params.id.eq })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } } },
        }),
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } } },
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(1)
      expect(result.map(r => r.result)).toEqual([
        { foo: '42' },
        { foo: '42' },
      ])
    })

    it('should support dedupe:false', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: payload.findOptions.params.id.eq })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } }, dedupe: false },
        }),
        findFirst({
          store: mockStore,
          collection,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } }, dedupe: false },
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.map(r => r.result)).toEqual([
        { foo: '42' },
        { foo: '42' },
      ])
    })
  })

  describe('abort fetchFirst', () => {
    it('should abort fetchFirst if setResult is called', async () => {
      const fetchFirstHook1 = vi.fn((payload) => {
        payload.setResult({ id: '42' })
      })
      const fetchFirstHook2 = vi.fn((payload) => {
        payload.setResult({ id: '43' })
      })
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook1)
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook2)

      const result = await findFirst({
        store: mockStore,
        collection,
        findOptions: '42',
      })

      expect(result.result).toEqual({ id: '42' })
      expect(fetchFirstHook1).toHaveBeenCalled()
      expect(fetchFirstHook2).not.toHaveBeenCalled()
    })

    it('should not abort if setResult is not called', async () => {
      const fetchFirstHook1 = vi.fn()
      const fetchFirstHook2 = vi.fn((payload) => {
        payload.setResult({ id: '43' })
      })
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook1)
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook2)

      const result = await findFirst({
        store: mockStore,
        collection,
        findOptions: '42',
      })

      expect(result.result).toEqual({ id: '43' })
      expect(fetchFirstHook1).toHaveBeenCalled()
      expect(fetchFirstHook2).toHaveBeenCalled()
    })

    it('should not abort if setResult is called with abort: false', async () => {
      const fetchFirstHook1 = vi.fn((payload) => {
        payload.setResult({ id: '42' }, { abort: false })
      })
      const fetchFirstHook2 = vi.fn((payload) => {
        payload.setResult({ id: '43' })
      })
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook1)
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook2)

      const result = await findFirst({
        store: mockStore,
        collection,
        findOptions: '42',
      })

      expect(result.result).toEqual({ id: '43' })
      expect(fetchFirstHook1).toHaveBeenCalled()
      expect(fetchFirstHook2).toHaveBeenCalled()
    })

    it('should not abort if result is nil', async () => {
      const fetchFirstHook1 = vi.fn((payload) => {
        payload.setResult(null)
      })
      const fetchFirstHook2 = vi.fn((payload) => {
        payload.setResult({ id: '43' })
      })
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook1)
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook2)

      const result = await findFirst({
        store: mockStore,
        collection,
        findOptions: '42',
      })

      expect(result.result).toEqual({ id: '43' })
      expect(fetchFirstHook1).toHaveBeenCalled()
      expect(fetchFirstHook2).toHaveBeenCalled()
    })

    it('should abort when calling abort()', async () => {
      const fetchFirstHook1 = vi.fn((payload) => {
        payload.abort()
      })
      const fetchFirstHook2 = vi.fn((payload) => {
        payload.setResult({ id: '43' })
      })
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook1)
      mockStore.$hooks.hook('fetchFirst', fetchFirstHook2)

      const result = await findFirst({
        store: mockStore,
        collection,
        findOptions: '42',
      })

      expect(result.result).toBeNull()
      expect(fetchFirstHook1).toHaveBeenCalled()
      expect(fetchFirstHook2).not.toHaveBeenCalled()
    })
  })
})
