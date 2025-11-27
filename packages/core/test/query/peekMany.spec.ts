import type { Collection, CollectionDefaults, ResolvedCollection, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { peekMany } from '../../src/query/peekMany'

interface TestCollectionDefaults extends CollectionDefaults {
  name: string
}

interface TestCollectionType extends Collection {
  id: string
}

describe('peekMany', () => {
  let mockStore: StoreCore<any, any>
  let collection: ResolvedCollection

  beforeEach(() => {
    mockStore = {
      $cache: {
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
      },
      $hooks: createHooks(),
      $resolveFindOptions: (collection: any, options: any) => ({
        fetchPolicy: 'cache-first',
        ...options,
      }),
    } as any

    collection = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return all items from the cache', () => {
    const result = peekMany({
      store: mockStore,
      collection,
    })

    expect(result.result).toEqual([{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }])
  })

  it('should return filtered items from the cache', () => {
    const filter = (item: WrappedItem<TestCollectionType, TestCollectionDefaults, any>) => item.id === '2'
    let receivedFilter = null
    mockStore.$cache.readItems = ({ filter }) => {
      receivedFilter = filter
      return [{ id: '2', name: 'Test Item 2' }] as any
    }
    const result = peekMany({
      store: mockStore,
      collection,
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
      collection,
      findOptions: {
        filter: (item: WrappedItem<TestCollectionType, TestCollectionDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toEqual([])
  })

  it('should call hooks with correct context', () => {
    const callHookSyncSpy = vi.spyOn(mockStore.$hooks, 'callHookSync')

    peekMany({
      store: mockStore,
      collection,
    })

    expect(callHookSyncSpy).toHaveBeenCalledWith('beforeCacheReadMany', expect.any(Object))
    expect(callHookSyncSpy).toHaveBeenCalledWith('cacheFilterMany', expect.any(Object))
  })
})
