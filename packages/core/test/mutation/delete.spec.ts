import type { Collection, CollectionDefaults, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteItem } from '../../src/mutation/delete'

describe('deleteItem', () => {
  let mockStore: StoreCore<StoreSchema, CollectionDefaults>
  let mockCollection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  let mockKey: string

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $cache: {
        deleteItem: vi.fn(),
        readItem: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
      },
      $mutationHistory: [],
    } as any

    mockCollection = {} as any
    mockKey = 'testKey'
  })

  it('should call deleteItem hook', async () => {
    const spy = vi.fn()
    mockStore.$hooks.hook('deleteItem', ({ store, collection, key }) => spy({ store, collection, key }))

    await deleteItem({
      store: mockStore,
      collection: mockCollection,
      key: mockKey,
    })

    expect(spy).toHaveBeenCalledWith({
      store: mockStore,
      collection: mockCollection,
      key: mockKey,
    })
  })

  it('should delete item from cache if skipCache is false', async () => {
    await deleteItem({
      store: mockStore,
      collection: mockCollection,
      key: mockKey,
      skipCache: false,
    })

    expect(mockStore.$cache.deleteItem).toHaveBeenCalledWith({
      collection: mockCollection,
      key: mockKey,
    })
  })

  it('should not delete item from cache if skipCache is true', async () => {
    await deleteItem({
      store: mockStore,
      collection: mockCollection,
      key: mockKey,
      skipCache: true,
    })

    expect(mockStore.$cache.deleteItem).not.toHaveBeenCalled()
  })

  it('should push delete operation to mutationHistory', async () => {
    await deleteItem({
      store: mockStore,
      collection: mockCollection,
      key: mockKey,
    })

    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'delete',
      collection: mockCollection,
      key: mockKey,
    })
  })

  it('should abort when calling abort()', async () => {
    const hook1 = vi.fn(({ abort }) => {
      abort()
    })
    const hook2 = vi.fn()
    mockStore.$hooks.hook('deleteItem', hook1)
    mockStore.$hooks.hook('deleteItem', hook2)

    await deleteItem({
      store: mockStore,
      collection: mockCollection,
      key: mockKey,
    })

    expect(hook1).toHaveBeenCalled()
    expect(hook2).not.toHaveBeenCalled()
  })
})
