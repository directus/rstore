import type { Model, ModelDefaults, ModelType, ResolvedModelType, StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteItem } from '../../src/mutation/delete'

describe('deleteItem', () => {
  let mockStore: StoreCore<Model, ModelDefaults>
  let mockType: ResolvedModelType<ModelType, ModelDefaults, Model>
  let mockKey: string

  beforeEach(() => {
    mockStore = {
      hooks: createHooks(),
      cache: {
        deleteItem: vi.fn(),
      },
      mutationHistory: [],
    } as any

    mockType = {} as any
    mockKey = 'testKey'
  })

  it('should call deleteItem hook', async () => {
    const spy = vi.fn()
    mockStore.hooks.hook('deleteItem', ({ store, type, key }) => spy({ store, type, key }))

    await deleteItem({
      store: mockStore,
      type: mockType,
      key: mockKey,
    })

    expect(spy).toHaveBeenCalledWith({
      store: mockStore,
      type: mockType,
      key: mockKey,
    })
  })

  it('should delete item from cache if skipCache is false', async () => {
    await deleteItem({
      store: mockStore,
      type: mockType,
      key: mockKey,
      skipCache: false,
    })

    expect(mockStore.cache.deleteItem).toHaveBeenCalledWith({
      type: mockType,
      key: mockKey,
    })
  })

  it('should not delete item from cache if skipCache is true', async () => {
    await deleteItem({
      store: mockStore,
      type: mockType,
      key: mockKey,
      skipCache: true,
    })

    expect(mockStore.cache.deleteItem).not.toHaveBeenCalled()
  })

  it('should push delete operation to mutationHistory', async () => {
    await deleteItem({
      store: mockStore,
      type: mockType,
      key: mockKey,
    })

    expect(mockStore.mutationHistory).toContainEqual({
      operation: 'delete',
      type: mockType,
      key: mockKey,
    })
  })
})
