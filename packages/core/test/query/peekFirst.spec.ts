import type { Collection, CollectionDefaults, ResolvedCollection, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { peekFirst } from '../../src/query/peekFirst'

interface TestCollectionDefaults extends CollectionDefaults {
  name: string
}

interface TestCollectionType extends Collection {
  id: string
}

describe('peekFirst', () => {
  let mockStore: StoreCore<any, any>
  let collection: ResolvedCollection

  beforeEach(() => {
    mockStore = {
      $cache: {
        readItem: ({ key }: any) => ({ id: key, name: 'Test Item' }),
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
      },
      $hooks: createHooks(),
      $getFetchPolicy: () => 'cache-first',
    } as any

    collection = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return the first item from the cache by key', () => {
    const result = peekFirst({
      store: mockStore,
      collection,
      findOptions: '1',
    })

    expect(result.result).toEqual({ id: '1', name: 'Test Item' })
  })

  it('should return the first item from the cache by filter', () => {
    const filter = (item: WrappedItem<TestCollectionType, TestCollectionDefaults, any>) => item.id === '2'
    let receivedFilter = null
    mockStore.$cache.readItems = ({ filter }) => {
      receivedFilter = filter
      return [{ id: '2', name: 'Test Item 2' }] as any
    }
    const result = peekFirst({
      store: mockStore,
      collection,
      findOptions: {
        filter,
      },
    })

    expect(result.result).toEqual({ id: '2', name: 'Test Item 2' })
    expect(receivedFilter).toBe(filter)
  })

  it('should return null if no item matches the filter', () => {
    mockStore.$cache.readItems = ({ filter }) => {
      if (filter) {
        return [] as any
      }
      return [{ id: '2', name: 'Test Item 2' }] as any
    }
    const result = peekFirst({
      store: mockStore,
      collection,
      findOptions: {
        filter: (item: WrappedItem<TestCollectionType, TestCollectionDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toBeNull()
  })

  it('should call hooks with correct context', () => {
    const callHookSyncSpy = vi.spyOn(mockStore.$hooks, 'callHookSync')

    peekFirst({
      store: mockStore,
      collection,
      findOptions: '1',
    })

    expect(callHookSyncSpy).toHaveBeenCalledWith('beforeCacheReadFirst', expect.any(Object))
    expect(callHookSyncSpy).toHaveBeenCalledWith('cacheFilterFirst', expect.any(Object))
  })
})
