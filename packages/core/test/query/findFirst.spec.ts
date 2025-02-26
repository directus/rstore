import type { ModelDefaults, ModelType, ResolvedModelType, StoreCore, TrackedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findFirst } from '../../src/query/findFirst'

interface TestModelDefaults extends ModelDefaults {
  name: string
}

interface TestModelType extends ModelType {
  id: string
}

vi.mock('../../src/query/peekFirst', () => ({
  peekFirst: vi.fn(({ findOptions }) => {
    if (typeof findOptions !== 'string' && findOptions.key === '1') {
      return { result: { id: '1', name: 'Test Item' }, marker: 'marker-1' }
    }
    if (findOptions.filter?.({ id: '2', name: 'Test Item 2' })) {
      return { result: { id: '2', name: 'Test Item 2' }, marker: 'marker-2' }
    }
    return { result: null, marker: undefined }
  }),
}))

describe('findFirst', () => {
  let mockStore: StoreCore<any, any>
  let modelType: ResolvedModelType<any, any>

  beforeEach(() => {
    mockStore = {
      cache: {
        readItem: ({ key }: any) => ({ id: key, name: 'Test Item' }),
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
        writeItem: vi.fn(),
      },
      hooks: createHooks(),
      getFetchPolicy: () => 'cache-first',
      processItemParsing: vi.fn(),
    } as any

    modelType = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return the first item from the cache by key', async () => {
    const result = await findFirst({
      store: mockStore,
      type: modelType,
      findOptions: '1',
    })

    expect(result.result).toEqual({ id: '1', name: 'Test Item' })
  })

  it('should return the first item from the cache by filter', async () => {
    const result = await findFirst({
      store: mockStore,
      type: modelType,
      findOptions: {
        filter: (item: TrackedItem<TestModelType, TestModelDefaults, any>) => item.id === '2',
      },
    })

    expect(result.result).toEqual({ id: '2', name: 'Test Item 2' })
  })

  it('should return null if no item matches the filter', async () => {
    const result = await findFirst({
      store: mockStore,
      type: modelType,
      findOptions: {
        filter: (item: TrackedItem<TestModelType, TestModelDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toBeNull()
  })

  it('should call hooks with correct context', async () => {
    const callHookSpy = vi.spyOn(mockStore.hooks, 'callHook')

    await findFirst({
      store: mockStore,
      type: modelType,
      findOptions: '42',
    })

    expect(callHookSpy).toHaveBeenCalledWith('fetchFirst', expect.any(Object))
  })

  it('should write item to cache if fetch policy allows', async () => {
    mockStore.getFetchPolicy = () => 'cache-and-fetch'
    mockStore.hooks.hook('fetchFirst', (payload) => {
      payload.setResult({ id: '42' })
    })

    const result = await findFirst({
      store: mockStore,
      type: modelType,
      findOptions: '42',
    })

    expect(mockStore.cache.writeItem).toHaveBeenCalledWith(expect.objectContaining({
      type: modelType,
      key: '42',
      item: result.result,
    }))
  })

  it('should not write item to cache if fetch policy is no-cache', async () => {
    mockStore.getFetchPolicy = () => 'no-cache'
    await findFirst({
      store: mockStore,
      type: modelType,
      findOptions: '1',
    })

    expect(mockStore.cache.writeItem).not.toHaveBeenCalled()
  })
})
