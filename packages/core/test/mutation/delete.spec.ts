import type { Model, ModelDefaults, ResolvedModel, StoreCore, StoreSchema } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteItem } from '../../src/mutation/delete'

describe('deleteItem', () => {
  let mockStore: StoreCore<StoreSchema, ModelDefaults>
  let mockModel: ResolvedModel<Model, ModelDefaults, StoreSchema>
  let mockKey: string

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $cache: {
        deleteItem: vi.fn(),
      },
      $mutationHistory: [],
    } as any

    mockModel = {} as any
    mockKey = 'testKey'
  })

  it('should call deleteItem hook', async () => {
    const spy = vi.fn()
    mockStore.$hooks.hook('deleteItem', ({ store, model, key }) => spy({ store, model, key }))

    await deleteItem({
      store: mockStore,
      model: mockModel,
      key: mockKey,
    })

    expect(spy).toHaveBeenCalledWith({
      store: mockStore,
      model: mockModel,
      key: mockKey,
    })
  })

  it('should delete item from cache if skipCache is false', async () => {
    await deleteItem({
      store: mockStore,
      model: mockModel,
      key: mockKey,
      skipCache: false,
    })

    expect(mockStore.$cache.deleteItem).toHaveBeenCalledWith({
      model: mockModel,
      key: mockKey,
    })
  })

  it('should not delete item from cache if skipCache is true', async () => {
    await deleteItem({
      store: mockStore,
      model: mockModel,
      key: mockKey,
      skipCache: true,
    })

    expect(mockStore.$cache.deleteItem).not.toHaveBeenCalled()
  })

  it('should push delete operation to mutationHistory', async () => {
    await deleteItem({
      store: mockStore,
      model: mockModel,
      key: mockKey,
    })

    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'delete',
      model: mockModel,
      key: mockKey,
    })
  })
})
