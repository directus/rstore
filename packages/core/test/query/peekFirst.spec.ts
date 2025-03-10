import type { Model, ModelDefaults, ResolvedModel, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { peekFirst } from '../../src/query/peekFirst'

interface TestModelDefaults extends ModelDefaults {
  name: string
}

interface TestModelType extends Model {
  id: string
}

describe('peekFirst', () => {
  let mockStore: StoreCore<any, any>
  let model: ResolvedModel<any, any, any>

  beforeEach(() => {
    mockStore = {
      $cache: {
        readItem: ({ key }: any) => ({ id: key, name: 'Test Item' }),
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
      },
      $hooks: createHooks(),
      $getFetchPolicy: () => 'cache-first',
    } as any

    model = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return the first item from the cache by key', () => {
    const result = peekFirst({
      store: mockStore,
      model,
      findOptions: '1',
    })

    expect(result.result).toEqual({ id: '1', name: 'Test Item' })
  })

  it('should return the first item from the cache by filter', () => {
    const result = peekFirst({
      store: mockStore,
      model,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '2',
      },
    })

    expect(result.result).toEqual({ id: '2', name: 'Test Item 2' })
  })

  it('should return null if no item matches the filter', () => {
    const result = peekFirst({
      store: mockStore,
      model,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toBeNull()
  })

  it('should call hooks with correct context', () => {
    const callHookSyncSpy = vi.spyOn(mockStore.$hooks, 'callHookSync')

    peekFirst({
      store: mockStore,
      model,
      findOptions: '1',
    })

    expect(callHookSyncSpy).toHaveBeenCalledWith('beforeCacheReadFirst', expect.any(Object))
    expect(callHookSyncSpy).toHaveBeenCalledWith('cacheFilterFirst', expect.any(Object))
  })
})
