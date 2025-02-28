import type { ModelDefaults, ModelType, ResolvedModelType, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { peekMany } from '../../src/query/peekMany'

interface TestModelDefaults extends ModelDefaults {
  name: string
}

interface TestModelType extends ModelType {
  id: string
}

describe('peekMany', () => {
  let mockStore: StoreCore<any, any>
  let modelType: ResolvedModelType<any, any>

  beforeEach(() => {
    mockStore = {
      cache: {
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
      },
      hooks: createHooks(),
      getFetchPolicy: () => 'cache-first',
    } as any

    modelType = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return all items from the cache', () => {
    const result = peekMany({
      store: mockStore,
      type: modelType,
    })

    expect(result.result).toEqual([{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }])
  })

  it('should return filtered items from the cache', () => {
    const result = peekMany({
      store: mockStore,
      type: modelType,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '2',
      },
    })

    expect(result.result).toEqual([{ id: '2', name: 'Test Item 2' }])
  })

  it('should return an empty array if no items match the filter', () => {
    const result = peekMany({
      store: mockStore,
      type: modelType,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toEqual([])
  })

  it('should call hooks with correct context', () => {
    const callHookSyncSpy = vi.spyOn(mockStore.hooks, 'callHookSync')

    peekMany({
      store: mockStore,
      type: modelType,
    })

    expect(callHookSyncSpy).toHaveBeenCalledWith('beforeCacheReadMany', expect.any(Object))
    expect(callHookSyncSpy).toHaveBeenCalledWith('cacheFilterMany', expect.any(Object))
  })
})
