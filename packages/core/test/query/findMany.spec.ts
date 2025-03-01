import type { ModelDefaults, ModelType, ResolvedModelType, StoreCore, WrappedItem } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findMany } from '../../src/query/findMany'

interface TestModelDefaults extends ModelDefaults {
  name: string
}

interface TestModelType extends ModelType {
  id: string
}

vi.mock('../../src/query/peekMany', () => ({
  peekMany: vi.fn(({ findOptions }) => {
    if (findOptions.filter?.({ id: '2', name: 'Test Item 2' })) {
      return { result: [{ id: '2', name: 'Test Item 2' }], marker: 'marker-2' }
    }
    return { result: [], marker: undefined }
  }),
}))

describe('findMany', () => {
  let mockStore: StoreCore<any, any>
  let modelType: ResolvedModelType<any, any, any>

  beforeEach(() => {
    mockStore = {
      cache: {
        readItems: () => [{ id: '1', name: 'Test Item 1' }, { id: '2', name: 'Test Item 2' }],
        writeItems: vi.fn(),
      },
      hooks: createHooks(),
      getFetchPolicy: () => 'cache-first',
      processItemParsing: vi.fn(),
    } as any

    modelType = {
      getKey: (item: any) => item.id,
    } as any
  })

  it('should return items from the cache by filter', async () => {
    const result = await findMany({
      store: mockStore,
      type: modelType,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '2',
      },
    })

    expect(result.result).toEqual([{ id: '2', name: 'Test Item 2' }])
  })

  it('should return an empty array if no items match the filter', async () => {
    const result = await findMany({
      store: mockStore,
      type: modelType,
      findOptions: {
        filter: (item: WrappedItem<TestModelType, TestModelDefaults, any>) => item.id === '3',
      },
    })

    expect(result.result).toEqual([])
  })

  it('should call hooks with correct context', async () => {
    const callHookSpy = vi.spyOn(mockStore.hooks, 'callHook')

    await findMany({
      store: mockStore,
      type: modelType,
      findOptions: {
        params: {
          email: '42',
        },
      },
    })

    expect(callHookSpy).toHaveBeenCalledWith('fetchMany', expect.any(Object))
  })

  it('should write items to cache if fetch policy allows', async () => {
    mockStore.getFetchPolicy = () => 'cache-and-fetch'
    mockStore.hooks.hook('fetchMany', (payload) => {
      payload.setResult([{ id: '42', name: 'Fetched Item' }])
    })

    const result = await findMany({
      store: mockStore,
      type: modelType,
      findOptions: {
        params: {
          email: '42',
        },
      },
    })

    expect(mockStore.cache.writeItems).toHaveBeenCalledWith(expect.objectContaining({
      type: modelType,
      items: [{ key: '42', value: result.result[0] }],
      marker: expect.any(String),
    }))
  })

  it('should not write items to cache if fetch policy is no-cache', async () => {
    mockStore.getFetchPolicy = () => 'no-cache'
    await findMany({
      store: mockStore,
      type: modelType,
      findOptions: {
        params: {
          email: '42',
        },
      },
    })

    expect(mockStore.cache.writeItems).not.toHaveBeenCalled()
  })
})
