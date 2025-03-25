import type { VueStore } from '../src'
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createQuery } from '../src/query'

describe('createQuery', () => {
  let mockStore: VueStore

  let mockFetchMethod: MockedFunction<any>
  let mockCacheMethod: MockedFunction<any>

  beforeEach(() => {
    mockStore = {
      $getFetchPolicy: vi.fn(value => value ?? 'cache-first'),
      $onCacheReset: vi.fn(),
    } as any

    mockFetchMethod = vi.fn()
    mockCacheMethod = vi.fn()
  })

  it('should initialize with default values with fetch policy no-cache', async () => {
    const defaultValue = { data: 'default' }
    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options: ref({
        fetchPolicy: 'no-cache',
      }),
    })

    expect(query.data.value).toEqual(defaultValue)
  })

  it('should call fetchMethod on load', async () => {
    const defaultValue = { data: 'default' }
    const cacheResult = { data: 'fetched' }
    mockCacheMethod.mockReturnValue(cacheResult)

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options: ref(undefined),
    })

    const result = await query
    expect(mockFetchMethod).toHaveBeenCalled()
    expect(result.data.value).toEqual(cacheResult)
  })

  it('should handle fetch errors', async () => {
    const defaultValue = { data: 'default' }
    const fetchError = new Error('Fetch failed')
    mockFetchMethod.mockRejectedValue(fetchError)

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options: ref(undefined),
    })

    const result = await query
    expect(result.error.value).toEqual(fetchError)
    expect(result.loading.value).toBe(false)
  })

  it('should refresh data when option changes', async () => {
    const defaultValue = { data: 'default' }
    const cacheResult = { data: 'fetched' }
    mockCacheMethod.mockReturnValue(cacheResult)

    const options = ref<any>({ params: { id: 1 } })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options,
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)
    expect(mockFetchMethod).toHaveBeenCalledTimes(1)

    const newFetchResult = { data: 'refreshed' }
    mockFetchMethod.mockResolvedValue(newFetchResult)

    options.value.params.id = 2

    await nextTick()

    expect(query._result.value).toEqual(newFetchResult)
    expect(mockFetchMethod).toHaveBeenCalledTimes(2)
  })

  it('should refresh data when refresh is called', async () => {
    const defaultValue = { data: 'default' }
    const cacheResult = { data: 'fetched' }
    mockCacheMethod.mockReturnValue(cacheResult)

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options: ref(undefined),
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)

    const newFetchResult = { data: 'refreshed' }
    mockFetchMethod.mockResolvedValue(newFetchResult)

    const refreshedResult = await result.refresh()
    expect(refreshedResult._result.value).toEqual(newFetchResult)
  })

  it('should not load data when query is disabled', async () => {
    const defaultValue = { data: 'default' }
    const cacheResult = { data: 'fetched' }
    mockCacheMethod.mockReturnValue(cacheResult)

    const options = ref<any>({ enabled: false })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options,
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)
    expect(result._result.value).toEqual(defaultValue)
    expect(mockFetchMethod).not.toHaveBeenCalled()
  })

  it('should re-enable query by setting option to object', async () => {
    const defaultValue = { data: 'default' }
    const cacheResult = { data: 'fetched' }
    mockCacheMethod.mockReturnValue(cacheResult)
    mockFetchMethod.mockResolvedValue(cacheResult)

    const options = ref<any>({ enabled: false })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options,
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
    const defaultValue = { data: 'default' }
    const cacheResult = { data: 'fetched' }
    mockCacheMethod.mockReturnValue(cacheResult)
    mockFetchMethod.mockResolvedValue(cacheResult)

    const options = ref<any>({ enabled: false })

    const query = createQuery({
      store: mockStore,
      fetchMethod: mockFetchMethod,
      cacheMethod: mockCacheMethod,
      defaultValue,
      options,
    })

    const result = await query
    expect(result.data.value).toEqual(cacheResult)
    expect(result._result.value).toEqual(defaultValue)
    expect(mockFetchMethod).not.toHaveBeenCalled()

    options.value = undefined

    await nextTick()

    expect(result._result.value).toEqual(cacheResult)
    expect(mockFetchMethod).toHaveBeenCalledOnce()
  })
})
