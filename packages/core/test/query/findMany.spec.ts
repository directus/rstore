import type { Model, ModelDefaults, ResolvedModel, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findMany } from '../../src/query/findMany'

interface TestModelDefaults extends ModelDefaults {
  name: string
}

interface TestModelType extends Model {
  id: string
}

vi.mock('../../src/query/peekMany', () => ({
  peekMany: vi.fn(({ findOptions }) => {
    if (typeof findOptions?.filter === 'function' && findOptions.filter?.({ id: '2', name: 'Test Item 2' })) {
      return { result: [{ id: '2', name: 'Test Item 2' }], marker: 'marker-2' }
    }
    return { result: [], marker: undefined }
  }),
}))

describe('findMany', () => {
  let mockStore: StoreCore<any, any>
  let model: ResolvedModel

  beforeEach(() => {
    mockStore = {
      $cache: {
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
        writeItems: vi.fn(),
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

  it('should return items from the cache by filter', async () => {
    const result = await findMany({
      store: mockStore,
      model,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '2',
      },
    })

    expect(result.result).toEqual([{ id: '2', name: 'Test Item 2' }])
  })

  it('should return an empty array if no items match the filter', async () => {
    const result = await findMany({
      store: mockStore,
      model,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toEqual([])
  })

  it('should call hooks with correct context', async () => {
    const callHookSpy = vi.spyOn(mockStore.$hooks, 'callHook')

    await findMany({
      store: mockStore,
      model,
      findOptions: {
        params: {
          email: '42',
        },
      },
    })

    expect(callHookSpy).toHaveBeenCalledWith('fetchMany', expect.any(Object))
  })

  it('should write items to cache if fetch policy allows', async () => {
    mockStore.$getFetchPolicy = () => 'cache-and-fetch'
    mockStore.$hooks.hook('fetchMany', (payload) => {
      payload.setResult([{ id: '42', name: 'Fetched Item' }])
    })

    const result = await findMany({
      store: mockStore,
      model,
      findOptions: {
        params: {
          email: '42',
        },
      },
    })

    expect(mockStore.$cache.writeItems).toHaveBeenCalledWith(expect.objectContaining({
      model,
      items: [{ key: '42', value: result.result[0] }],
      marker: expect.any(String),
    }))
  })

  it('should not write items to cache if fetch policy is no-cache', async () => {
    mockStore.$getFetchPolicy = () => 'no-cache'
    await findMany({
      store: mockStore,
      model,
      findOptions: {
        params: {
          email: '42',
        },
      },
    })

    expect(mockStore.$cache.writeItems).not.toHaveBeenCalled()
  })

  describe('should dedupe finds', () => {
    it('should dedupe findMany on findOptions', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult([{ foo: 'bar' }])
      })
      mockStore.$hooks.hook('fetchMany', fn)

      const result = await Promise.all([
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
      ])

      expect(fn).toHaveBeenCalledOnce()
      expect(result.map(r => r.result)).toEqual([
        [{ foo: 'bar' }],
        [{ foo: 'bar' }],
      ])
    })

    it('should not dedupe findMany on different model', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult([{ foo: 'bar' }])
      })
      mockStore.$hooks.hook('fetchMany', fn)

      const result = await Promise.all([
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
        findMany({
          store: mockStore,
          model: {
            ...model,
            name: 'Other',
          },
          findOptions: { filter: { id: { eq: '42' } } },
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.map(r => r.result)).toEqual([
        [{ foo: 'bar' }],
        [{ foo: 'bar' }],
      ])
    })

    it('should not dedupe findMany on different findOptions', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult([{ foo: payload.findOptions.filter.id.eq }])
      })
      mockStore.$hooks.hook('fetchMany', fn)

      const result = await Promise.all([
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: { id: { eq: '42' } } },
        }),
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: { id: { eq: '43' } } },
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.map(r => r.result)).toEqual([
        [{ foo: '42' }],
        [{ foo: '43' }],
      ])
    })

    it('should ignore filter function', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult([{ foo: payload.findOptions.params.id.eq }])
      })
      mockStore.$hooks.hook('fetchMany', fn)

      const result = await Promise.all([
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } } },
        }),
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } } },
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(1)
      expect(result.map(r => r.result)).toEqual([
        [{ foo: '42' }],
        [{ foo: '42' }],
      ])
    })

    it('should support dedupe:false', async () => {
      const fn = vi.fn((payload) => {
        payload.setResult([{ foo: payload.findOptions.params.id.eq }])
      })
      mockStore.$hooks.hook('fetchMany', fn)

      const result = await Promise.all([
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } }, dedupe: false },
        }),
        findMany({
          store: mockStore,
          model,
          findOptions: { filter: () => {}, params: { id: { eq: '42' } }, dedupe: false },
        }),
      ])

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.map(r => r.result)).toEqual([
        [{ foo: '42' }],
        [{ foo: '42' }],
      ])
    })
  })
})
