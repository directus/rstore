import type { CacheLayer, Collection, CollectionDefaults, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteMany } from '../../src/mutation/deleteMany'

describe('deleteMany', () => {
  let mockStore: StoreCore<StoreSchema, CollectionDefaults>
  let mockCollection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  let mockKeys: Array<string | number>
  let mockReadItem: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock crypto.randomUUID
    const mockUUID = vi.fn(() => 'mock-uuid')
    vi.stubGlobal('crypto', { randomUUID: mockUUID })

    mockReadItem = vi.fn()

    mockStore = {
      $hooks: createHooks(),
      $cache: {
        deleteItem: vi.fn(),
        readItem: mockReadItem,
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
      },
      $mutationHistory: [],
    } as any

    mockCollection = {
      name: 'testCollection',
    } as any
    mockKeys = ['key1', 'key2', 'key3']

    vi.clearAllMocks()
  })

  it('should call beforeManyMutation hook', async () => {
    const spy = vi.fn()
    mockStore.$hooks.hook('beforeManyMutation', spy)

    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
    })

    expect(spy).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'delete',
      keys: mockKeys,
      setItems: expect.any(Function),
    })
  })

  it('should call deleteMany hook', async () => {
    const spy = vi.fn()
    mockStore.$hooks.hook('deleteMany', spy)

    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
    })

    expect(spy).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      keys: mockKeys,
      abort: expect.any(Function),
    })
  })

  it('should call afterManyMutation hook', async () => {
    const spy = vi.fn()
    mockStore.$hooks.hook('afterManyMutation', spy)

    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
    })

    expect(spy).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'delete',
      keys: mockKeys,
      getResult: expect.any(Function),
      setResult: expect.any(Function),
    })
  })

  it('should delete items from cache when skipCache is false', async () => {
    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
      skipCache: false,
    })

    expect(mockStore.$cache.deleteItem).toHaveBeenCalledTimes(3)
    expect(mockStore.$cache.deleteItem).toHaveBeenCalledWith({
      collection: mockCollection,
      key: 'key1',
    })
    expect(mockStore.$cache.deleteItem).toHaveBeenCalledWith({
      collection: mockCollection,
      key: 'key2',
    })
    expect(mockStore.$cache.deleteItem).toHaveBeenCalledWith({
      collection: mockCollection,
      key: 'key3',
    })
  })

  it('should not delete items from cache when skipCache is true', async () => {
    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
      skipCache: true,
    })

    expect(mockStore.$cache.deleteItem).not.toHaveBeenCalled()
  })

  it('should add optimistic layer when optimistic is true and skipCache is false', async () => {
    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
      optimistic: true,
      skipCache: false,
    })

    expect(mockStore.$cache.addLayer).toHaveBeenCalledWith({
      id: 'mock-uuid',
      collectionName: mockCollection.name,
      state: {},
      deletedItems: new Set(mockKeys),
      optimistic: true,
    })
    expect(mockStore.$cache.removeLayer).toHaveBeenCalledWith('mock-uuid')
  })

  it('should not add optimistic layer when optimistic is false', async () => {
    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
      optimistic: false,
    })

    expect(mockStore.$cache.addLayer).not.toHaveBeenCalled()
    expect(mockStore.$cache.removeLayer).not.toHaveBeenCalled()
  })

  it('should not add optimistic layer when skipCache is true', async () => {
    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
      optimistic: true,
      skipCache: true,
    })

    expect(mockStore.$cache.addLayer).not.toHaveBeenCalled()
  })

  it('should push delete operation to mutationHistory', async () => {
    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
    })

    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'delete',
      collection: mockCollection,
      keys: mockKeys,
    })
  })

  it('should throw error when item deletion is prevented by layer', async () => {
    const mockLayer: CacheLayer = {
      id: 'prevent-layer',
      collectionName: 'testCollection',
      prevent: { delete: true },
      state: {},
      deletedItems: new Set(),
    }

    mockReadItem.mockReturnValue({
      $layer: mockLayer,
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      deleteMany({
        store: mockStore,
        collection: mockCollection,
        keys: ['key1'],
      }),
    ).rejects.toThrow('Item deletion prevented by the layer: prevent-layer')

    expect(consoleSpy).toHaveBeenCalledWith(mockLayer)
    consoleSpy.mockRestore()
  })

  it('should check all keys for layer prevention', async () => {
    const mockLayer: CacheLayer = {
      id: 'prevent-layer',
      collectionName: 'testCollection',
      prevent: { delete: true },
      state: {},
      deletedItems: new Set(),
    }

    mockReadItem
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ $layer: mockLayer })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      deleteMany({
        store: mockStore,
        collection: mockCollection,
        keys: ['key1', 'key2'],
      }),
    ).rejects.toThrow('Item deletion prevented by the layer: prevent-layer')

    expect(mockReadItem).toHaveBeenCalledTimes(2)
    consoleSpy.mockRestore()
  })

  it('should rollback optimistic layer on error', async () => {
    const error = new Error('Delete failed')
    mockStore.$hooks.hook('deleteMany', () => {
      throw error
    })

    await expect(
      deleteMany({
        store: mockStore,
        collection: mockCollection,
        keys: mockKeys,
        optimistic: true,
      }),
    ).rejects.toThrow('Delete failed')

    expect(mockStore.$cache.addLayer).toHaveBeenCalled()
    expect(mockStore.$cache.removeLayer).toHaveBeenCalledWith('mock-uuid')
  })

  it('should not rollback when no optimistic layer was created on error', async () => {
    const error = new Error('Delete failed')
    mockStore.$hooks.hook('deleteMany', () => {
      throw error
    })

    await expect(
      deleteMany({
        store: mockStore,
        collection: mockCollection,
        keys: mockKeys,
        optimistic: false,
      }),
    ).rejects.toThrow('Delete failed')

    expect(mockStore.$cache.removeLayer).not.toHaveBeenCalled()
  })

  it('should abort when calling abort()', async () => {
    const hook1 = vi.fn(({ abort }) => {
      abort()
    })
    const hook2 = vi.fn()
    mockStore.$hooks.hook('deleteMany', hook1)
    mockStore.$hooks.hook('deleteMany', hook2)

    await deleteMany({
      store: mockStore,
      collection: mockCollection,
      keys: mockKeys,
    })

    expect(hook1).toHaveBeenCalled()
    expect(hook2).not.toHaveBeenCalled()
  })
})
