import type { ResolvedModel } from '@rstore/shared'
import type { VueStore } from '../src'
import type { WrappedItemMetadata } from '../src/item'
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createQuery } from '../src/query'

describe('createQuery', () => {
  let mockStore: VueStore<any, any>
  let mockModel: ResolvedModel<any, any, any>
  let mockWrappedCache: Map<string, any>

  let mockFetchMethod: MockedFunction<any>
  let mockCacheMethod: MockedFunction<any>

  beforeEach(() => {
    mockModel = {
      name: 'testModel',
      getKey: (item: any) => item.id ?? 'foo',
    } as any

    mockStore = {
      $getFetchPolicy: vi.fn(value => value ?? 'cache-first'),
      $onCacheReset: vi.fn(),
      $cache: {
        wrapItem: vi.fn(({ item }) => {
          const key = mockModel.getKey(item)
          if (mockWrappedCache?.has(key)) {
            return mockWrappedCache.get(key)
          }
          const metadata: WrappedItemMetadata<any, any, any> = {
            queries: new Set(),
            dirtyQueries: new Set(),
          }
          const wrapped = new Proxy(item, {
            get: (target, key) => {
              if (key === '$meta') {
                return metadata
              }
              return Reflect.get(target, key)
            },
          })
          mockWrappedCache?.set(key, wrapped)
          return wrapped
        }),
        deleteItem: vi.fn(),
        garbageCollectItem: vi.fn(),
      },
    } as any

    mockFetchMethod = vi.fn()
    mockCacheMethod = vi.fn()
  })

  it('should initialize with default values with fetch policy no-cache', async () => {
    const defaultValue = { text: 'default' }
    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }),
      options: ref({
        fetchPolicy: 'no-cache',
      }),
      model: mockModel,
      name: 'query',
    })

    expect(query.data.value).toEqual(defaultValue)
  })

  it('should call fetchMethod on load', async () => {
    const defaultValue = { text: 'default' }
    const cacheResult = { text: 'fetched' }
    mockCacheMethod.mockReturnValue(mockStore.$cache.wrapItem({ model: mockModel, item: cacheResult }))

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }),
      options: ref(undefined),
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(mockFetchMethod).toHaveBeenCalled()
    expect(result.data.value).toEqual(cacheResult)
  })

  it('should handle fetch errors', async () => {
    const defaultValue = { text: 'default' }
    const fetchError = new Error('Fetch failed')
    mockFetchMethod.mockRejectedValue(fetchError)

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }),
      options: ref(undefined),
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(result.error.value).toEqual(fetchError)
    expect(result.loading.value).toBe(false)
  })

  it('should refresh data when option changes', async () => {
    const defaultValue = { text: 'default' }
    const cacheResult = { text: 'fetched' }
    mockCacheMethod.mockReturnValue(mockStore.$cache.wrapItem({ model: mockModel, item: cacheResult }))

    const options = ref<any>({ params: { id: 1 } })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }),
      options,
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)
    expect(mockFetchMethod).toHaveBeenCalledTimes(1)

    const newFetchResult = { text: 'refreshed' }
    mockFetchMethod.mockResolvedValue(mockStore.$cache.wrapItem({ model: mockModel, item: newFetchResult }))

    options.value.params.id = 2

    await nextTick()

    expect(query._result.value).toEqual(newFetchResult)
    expect(mockFetchMethod).toHaveBeenCalledTimes(2)
  })

  it('should refresh data when refresh is called', async () => {
    const defaultValue = { text: 'default' }
    const cacheResult = { text: 'fetched' }
    mockCacheMethod.mockReturnValue(mockStore.$cache.wrapItem({ model: mockModel, item: cacheResult }))

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }),
      options: ref(undefined),
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)

    const newFetchResult = { text: 'refreshed' }
    mockFetchMethod.mockResolvedValue(mockStore.$cache.wrapItem({ model: mockModel, item: newFetchResult }))

    const refreshedResult = await result.refresh()
    expect(refreshedResult._result.value).toEqual(newFetchResult)
  })

  it('should not load data when query is disabled', async () => {
    const defaultValue = { text: 'default' }
    const cacheResult = { text: 'fetched' }
    mockCacheMethod.mockReturnValue(mockStore.$cache.wrapItem({ model: mockModel, item: cacheResult }))

    const options = ref<any>({ enabled: false })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }),
      options,
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)
    expect(result._result.value).toEqual(defaultValue)
    expect(mockFetchMethod).not.toHaveBeenCalled()
  })

  it('should re-enable query by setting option to object', async () => {
    const defaultValue = { text: 'default' }
    const cacheResult = { text: 'fetched' }
    mockCacheMethod.mockReturnValue(mockStore.$cache.wrapItem({ model: mockModel, item: cacheResult }))
    mockFetchMethod.mockResolvedValue(mockStore.$cache.wrapItem({ model: mockModel, item: cacheResult }))

    const options = ref<any>({ enabled: false })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }),
      options,
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)
    expect(result._result.value).toEqual(defaultValue)
    expect(mockFetchMethod).not.toHaveBeenCalled()

    options.value = {}

    await nextTick()

    expect(result._result.value).toEqual(cacheResult)
    expect(mockFetchMethod).toHaveBeenCalledOnce()
  })

  it('should re-enable query by setting option to undefined', async () => {
    const defaultValue = { text: 'default' }
    const fetchResult = { text: 'fetched' }
    mockCacheMethod.mockReturnValue(mockStore.$cache.wrapItem({ model: mockModel, item: defaultValue }))
    mockFetchMethod.mockResolvedValue(mockStore.$cache.wrapItem({ model: mockModel, item: fetchResult }))

    const options = ref<any>({ enabled: false })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: [],
      options,
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(result.data.value).toEqual(defaultValue)
    expect(result._result.value).toEqual([])
    expect(mockFetchMethod).not.toHaveBeenCalled()

    options.value = undefined

    await nextTick()

    expect(result._result.value).toEqual(fetchResult)
    expect(mockFetchMethod).toHaveBeenCalledOnce()
  })

  it('should mark items as dirty', async () => {
    mockWrappedCache = new Map()

    const cacheResult = [{ id: 1 }, { id: 2 }]
    const fetchResult = [{ id: 1 }]
    mockCacheMethod.mockReturnValue(cacheResult.map(item => mockStore.$cache.wrapItem({ model: mockModel, item })))
    mockFetchMethod.mockResolvedValue(fetchResult.map(item => mockStore.$cache.wrapItem({ model: mockModel, item })))

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: [],
      options: {},
      model: mockModel,
      name: 'query',
    })

    const result = await query
    expect(query.data.value).toEqual(cacheResult)
    expect(mockFetchMethod).toHaveBeenCalledTimes(1)
    expect(result.data.value[0].$meta.dirtyQueries.size).toBe(0)
    expect(result.data.value[1].$meta.dirtyQueries.size).toBe(1)
    expect(result.data.value[1].$meta.dirtyQueries.has('testModel:query:{}')).toBe(true)
  })

  it('should garbage collect dirty items', async () => {
    mockWrappedCache = new Map()

    const cacheResult = [{ id: 1 }, { id: 2 }]
    const fetchResult = [{ id: 1 }]
    mockCacheMethod.mockReturnValue(cacheResult.map(item => mockStore.$cache.wrapItem({ model: mockModel, item })))
    mockFetchMethod.mockResolvedValue(fetchResult.map(item => mockStore.$cache.wrapItem({ model: mockModel, item })))

    const currentCache = cacheResult.slice()
    mockStore.$cache.garbageCollectItem = vi.fn(({ item }) => {
      if (item.$meta.queries.size === 0) {
        currentCache.splice(currentCache.findIndex(i => i.id === item.id), 1)
        mockCacheMethod.mockReturnValue(currentCache.map(i => mockStore.$cache.wrapItem({ model: mockModel, item: i })))
      }
    })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: [],
      options: {
        experimentalGarbageCollection: true,
      },
      model: mockModel,
      name: 'query',
    })

    expect(query.data.value).toEqual(cacheResult)
    await query
    expect(query.data.value).toEqual(fetchResult)
  })

  it('should not garbage collect if item is used in another query', async () => {
    mockWrappedCache = new Map()

    const cacheResult = [{ id: 1 }, { id: 2 }]
    const fetchResult = [{ id: 1 }]
    mockCacheMethod.mockReturnValue(cacheResult.map(item => mockStore.$cache.wrapItem({ model: mockModel, item })))
    mockFetchMethod.mockResolvedValue(fetchResult.map(item => mockStore.$cache.wrapItem({ model: mockModel, item })))

    const currentCache = cacheResult.slice()
    mockStore.$cache.garbageCollectItem = vi.fn(({ item }) => {
      if (item.$meta.queries.size === 0) {
        currentCache.splice(currentCache.findIndex(i => i.id === item.id), 1)
        mockCacheMethod.mockReturnValue(currentCache.map(i => mockStore.$cache.wrapItem({ model: mockModel, item: i })))
      }
    })

    const otherQuery = createQuery({
      store: mockStore,
      fetchMethod: mockCacheMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: [],
      options: {
        experimentalGarbageCollection: true,
      },
      model: mockModel,
      name: 'otherQuery',
    })

    await otherQuery

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue: [],
      options: {
        experimentalGarbageCollection: true,
      },
      model: mockModel,
      name: 'query',
    })

    expect(query.data.value).toEqual(cacheResult)
    await query
    expect(query.data.value).toEqual(fetchResult)
    expect(otherQuery.data.value).toEqual(cacheResult)
  })
})
