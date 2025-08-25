import type { Model, ModelDefaults, ResolvedModel, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { peekMany } from '../../src/query/peekMany'

interface TestModelDefaults extends ModelDefaults {
  name: string
}

interface TestModelType extends Model {
  id: string
}

describe('peekMany', () => {
  let mockStore: StoreCore<any, any>
  let model: ResolvedModel

  beforeEach(() => {
    mockStore = {
      $cache: {
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
      },
      $hooks: createHooks(),
      $getFetchPolicy: () => 'cache-first',
    } as any

    model = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return all items from the cache', () => {
    const result = peekMany({
      store: mockStore,
      model,
    })

    expect(result.result).toEqual([{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }])
  })

  it('should return filtered items from the cache', () => {
    const filter = (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '2'
    let receivedFilter = null
    mockStore.$cache.readItems = ({ filter }) => {
      receivedFilter = filter
      return [{ id: '2', name: 'Test Item 2' }] as any
    }
    const result = peekMany({
      store: mockStore,
      model,
      findOptions: {
        filter,
      },
    })

    expect(result.result).toEqual([{ id: '2', name: 'Test Item 2' }])
    expect(receivedFilter).toBe(filter)
  })

  it('should return an empty array if no items match the filter', () => {
    mockStore.$cache.readItems = ({ filter }) => {
      if (filter) {
        return [] as any
      }
      return [{ id: '2', name: 'Test Item 2' }] as any
    }
    const result = peekMany({
      store: mockStore,
      model,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toEqual([])
  })

  it('should call hooks with correct context', () => {
    const callHookSyncSpy = vi.spyOn(mockStore.$hooks, 'callHookSync')

    peekMany({
      store: mockStore,
      model,
    })

    expect(callHookSyncSpy).toHaveBeenCalledWith('beforeCacheReadMany', expect.any(Object))
    expect(callHookSyncSpy).toHaveBeenCalledWith('cacheFilterMany', expect.any(Object))
  })
})
