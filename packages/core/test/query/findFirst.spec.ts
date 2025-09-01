import type { Model, ModelDefaults, ResolvedModel, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findFirst } from '../../src/query/findFirst'

interface TestModelDefaults extends ModelDefaults {
  name: string
}

interface TestModelType extends Model {
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
  let model: ResolvedModel

  beforeEach(() => {
    mockStore = {
      $cache: {
        readItem: ({ key }: any) => ({ id: key, name: 'Test Item' }),
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
        writeItem: vi.fn(),
        wrapItem: ({ item }: any) => {
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
        },
      },
      $hooks: createHooks(),
      $getFetchPolicy: () => 'cache-first',
      $processItemParsing: vi.fn(),
      $dedupePromises: new Map(),
    } as any

    model = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return the first item from the cache by key', async () => {
    const result = await findFirst({
      store: mockStore,
      model,
      findOptions: '1',
    })

    expect(result.result).toEqual({ id: '1', name: 'Test Item' })
  })

  it('should return the first item from the cache by filter', async () => {
    const result = await findFirst({
      store: mockStore,
      model,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '2',
      },
    })

    expect(result.result).toEqual({ id: '2', name: 'Test Item 2' })
  })

  it('should return null if no item matches the filter', async () => {
    const result = await findFirst({
      store: mockStore,
      model,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toBeNull()
  })

  it('should call hooks with correct context', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')

    await findFirst({
      store: mockStore,
      model,
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
      model,
      findOptions: '42',
    })

    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith(expect.objectContaining({
      model,
      key: '42',
      item: result.result,
    }))
  })

  it('should not write item to cache if fetch policy is no-cache', async () => {
    mockStore.$getFetchPolicy = () => 'no-cache'
    await findFirst({
      store: mockStore,
      model,
      findOptions: '1',
    })

    expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
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
          model,
          findOptions: '42',
        }),
        findFirst({
          store: mockStore,
          model,
          findOptions: '42',
        }),
      ])

      expect(fn).toHaveBeenCalledOnce()
      expect(result.map(r => r.result)).toEqual([
        { foo: 'bar' },
        { foo: 'bar' },
      ])
    })

    it('should not dedupe findFirst on different model', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult({ foo: payload.findOptions.key })
      })
      mockStore.$hooks.hook('fetchFirst', fn)

      const result = await Promise.all([
        findFirst({
          store: mockStore,
          model,
          findOptions: '42',
        }),
        findFirst({
          store: mockStore,
          model: {
            ...model,
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
          model,
          findOptions: '42',
        }),
        findFirst({
          store: mockStore,
          model,
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
          model,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
        findFirst({
          store: mockStore,
          model,
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
          model,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
        findFirst({
          store: mockStore,
          model,
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
          model,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } } },
        }),
        findFirst({
          store: mockStore,
          model,
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
          model,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } }, dedupe: false },
        }),
        findFirst({
          store: mockStore,
          model,
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
})
