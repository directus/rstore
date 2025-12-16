import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import type { UpdateManyOptions } from '../../src/mutation/updateMany'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMany } from '../../src/mutation/updateMany'

describe('updateMany', () => {
  let mockStore: StoreCore<StoreSchema, CollectionDefaults>
  let mockCollection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  let mockItems: Array<Partial<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>>
  let options: UpdateManyOptions<Collection, CollectionDefaults, StoreSchema>
  let mockRandomUUID: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock crypto.randomUUID with counter for unique values
    let uuidCounter = 0
    mockRandomUUID = vi.fn(() => `mock-uuid-${++uuidCounter}`)

    vi.stubGlobal('crypto', {
      randomUUID: mockRandomUUID,
    })

    mockStore = {
      $hooks: createHooks(),
      $cache: {
        readItem: vi.fn(),
        readItems: vi.fn(() => []),
        writeItems: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
      },
      $mutationHistory: [],
      $processItemParsing: vi.fn(),
      $processItemSerialization: vi.fn(),
      $resolveFindOptions: (collection: any, options: any) => ({
        fetchPolicy: 'cache-first',
        ...options,
      }),
    } as unknown as StoreCore<StoreSchema, CollectionDefaults>

    mockCollection = {
      name: 'testCollection',
      getKey: vi.fn(item => item.id),
    } as unknown as ResolvedCollection<Collection, CollectionDefaults, StoreSchema>

    mockItems = [
      { id: '1', name: 'updated-item1' },
      { id: '2', name: 'updated-item2' },
    ] as Array<Partial<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>>

    options = {
      store: mockStore,
      collection: mockCollection,
      items: mockItems,
      skipCache: false,
      optimistic: true,
    }

    // Mock peekMany dependency
    vi.doMock('../query', () => ({
      peekMany: vi.fn(() => ({ result: [] })),
    }))
  })

  it('should throw error when item key is not defined', async () => {
    mockCollection.getKey = vi.fn(() => undefined)

    await expect(updateMany(options)).rejects.toThrow('Item update failed: key is not defined')
  })

  it('should throw error when update is prevented by layer', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockLayer = { id: 'test-layer', prevent: { update: true } }

    mockStore.$cache.readItem = vi.fn(() => ({ $layer: mockLayer }) as any)

    await expect(updateMany(options)).rejects.toThrow('Item update prevented by the layer: test-layer')
    expect(consoleSpy).toHaveBeenCalledWith(mockLayer)

    consoleSpy.mockRestore()
  })

  it('should update multiple items and write them to the cache', async () => {
    const resultItems = [
      { id: '1', name: 'updated-item1' },
      { id: '2', name: 'updated-item2' },
    ] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany(options)

    expect(result).toEqual(resultItems)
    expect(mockStore.$processItemParsing).toHaveBeenCalledTimes(2)
    expect(mockStore.$cache.writeItems).toHaveBeenCalledWith({
      collection: mockCollection,
      items: [
        { key: '1', value: resultItems[0] },
        { key: '2', value: resultItems[1] },
      ],
    })
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      collection: mockCollection,
      payload: expect.any(Array),
    })
  })

  it('should fall back to individual updateItem hooks when updateMany is not handled', async () => {
    const resultItem1 = { id: '1', name: 'updated-item1' } as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    const resultItem2 = { id: '2', name: 'updated-item2' } as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>

    mockStore.$hooks.hook('updateItem', vi.fn(({ key, setResult }) => {
      if (key === '1')
        setResult(resultItem1)
      if (key === '2')
        setResult(resultItem2)
    }))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany(options)

    expect(result).toEqual([resultItem1, resultItem2])
    expect(mockStore.$processItemParsing).toHaveBeenCalledTimes(2)
  })

  it('should handle optimistic updates with cache layer', async () => {
    const resultItems = [
      { id: '1', name: 'updated-item1' },
      { id: '2', name: 'updated-item2' },
    ] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await updateMany(options)

    expect(mockStore.$cache.addLayer).toHaveBeenCalledWith({
      id: 'mock-uuid-1',
      collectionName: 'testCollection',
      state: {
        1: { ...mockItems[0], $overrideKey: '1' },
        2: { ...mockItems[1], $overrideKey: '2' },
      },
      deletedItems: new Set(),
      optimistic: true,
    })
    expect(mockStore.$cache.removeLayer).toHaveBeenCalledWith('mock-uuid-1')
  })

  it('should handle optimistic updates with custom optimistic data', async () => {
    const resultItems = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const optimisticData = [{ loading: true }]

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await updateMany({ ...options, items: [mockItems[0]!], optimistic: optimisticData })

    expect(mockStore.$cache.addLayer).toHaveBeenCalledWith({
      id: 'mock-uuid-1',
      collectionName: 'testCollection',
      state: {
        1: { ...mockItems[0], ...optimisticData[0], $overrideKey: '1' },
      },
      deletedItems: new Set(),
      optimistic: true,
    })
  })

  it('should skip cache when skipCache is true', async () => {
    const resultItems = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany({ ...options, skipCache: true })

    expect(result).toEqual(resultItems)
    expect(mockStore.$cache.addLayer).not.toHaveBeenCalled()
    expect(mockStore.$cache.writeItems).not.toHaveBeenCalled()
  })

  it('should skip optimistic updates when optimistic is false', async () => {
    const resultItems = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await updateMany({ ...options, optimistic: false })

    expect(mockStore.$cache.addLayer).not.toHaveBeenCalled()
    expect(mockStore.$cache.writeItems).toHaveBeenCalled()
  })

  it('should throw error when items have no keys for cache writing', async () => {
    const resultItems = [{ name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)
    mockCollection.getKey = vi.fn(() => undefined)

    await expect(updateMany({ ...options, items: [{ name: 'updated-item1' }] })).rejects.toThrow('Item update failed: key is not defined')
  })

  it('should serialize items before processing', async () => {
    const resultItems = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await updateMany(options)

    expect(mockStore.$processItemSerialization).toHaveBeenCalledTimes(2)
    expect(mockStore.$processItemSerialization).toHaveBeenCalledWith(mockCollection, mockItems[0])
    expect(mockStore.$processItemSerialization).toHaveBeenCalledWith(mockCollection, mockItems[1])
  })

  it('should call beforeManyMutation and afterManyMutation hooks', async () => {
    const beforeHook = vi.fn()
    const afterHook = vi.fn()
    const resultItems = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('beforeManyMutation', beforeHook)
    mockStore.$hooks.hook('afterManyMutation', afterHook)
    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await updateMany(options)

    expect(beforeHook).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'update',
      items: expect.any(Array),
      setItems: expect.any(Function),
    })
    expect(afterHook).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'update',
      items: expect.any(Array),
      getResult: expect.any(Function),
      setResult: expect.any(Function),
    })
  })

  it('should call afterMutation hook for each item when falling back to individual updates', async () => {
    const afterMutationHook = vi.fn()
    const resultItem = { id: '1', name: 'updated-item1' } as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>

    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockStore.$hooks.hook('afterMutation', afterMutationHook)
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await updateMany({ ...options, items: [mockItems[0]!] })

    expect(afterMutationHook).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'update',
      key: '1',
      item: expect.any(Object),
      getResult: expect.any(Function),
      setResult: expect.any(Function),
    })
  })

  it('should auto abort when updateMany setResult is called with non-empty result', async () => {
    const resultItems = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const updateManyHook = vi.fn(({ setResult }) => setResult(resultItems))
    const updateItemHook = vi.fn()

    mockStore.$hooks.hook('updateMany', updateManyHook)
    mockStore.$hooks.hook('updateItem', updateItemHook)
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await updateMany(options)

    expect(updateManyHook).toHaveBeenCalled()
    expect(updateItemHook).not.toHaveBeenCalled()
  })

  it('should not abort when updateMany setResult is called with abort: false', async () => {
    const resultItems1 = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const resultItems2 = [{ id: '2', name: 'updated-item2' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const hook1 = vi.fn(({ setResult }) => setResult(resultItems1, { abort: false }))
    const hook2 = vi.fn(({ setResult }) => setResult(resultItems2))

    mockStore.$hooks.hook('updateMany', hook1)
    mockStore.$hooks.hook('updateMany', hook2)
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany(options)

    expect(hook1).toHaveBeenCalled()
    expect(hook2).toHaveBeenCalled()
    expect(result).toEqual(resultItems2)
  })

  it('should rollback optimistic layer on error', async () => {
    const error = new Error('Test error')
    mockStore.$hooks.hook('updateMany', vi.fn(() => {
      throw error
    }))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    await expect(updateMany(options)).rejects.toThrow('Test error')

    expect(mockStore.$cache.addLayer).toHaveBeenCalled()
    expect(mockStore.$cache.removeLayer).toHaveBeenCalledWith('mock-uuid-1')
  })

  it('should handle empty result array', async () => {
    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult([])))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany(options)

    expect(result).toEqual([])
    expect(mockStore.$processItemParsing).not.toHaveBeenCalled()
    expect(mockStore.$cache.writeItems).not.toHaveBeenCalled()
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      collection: mockCollection,
      payload: expect.any(Array),
    })
  })

  it('should handle items modification in beforeManyMutation hook', async () => {
    const modifiedItems = [{ id: '3', name: 'modified' }]
    const resultItems = [{ id: '3', name: 'modified' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('beforeManyMutation', vi.fn(({ setItems }) => setItems(modifiedItems)))
    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany(options)

    expect(result).toEqual(resultItems)
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      collection: mockCollection,
      payload: expect.arrayContaining([
        expect.objectContaining({ key: '3' }),
      ]),
    })
  })

  it('should merge single results with existing result when falling back to individual updates', async () => {
    const existingItem = { id: '1', name: 'existing', version: 1 }
    const updatedItem = { id: '1', name: 'updated', version: 2 } as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>

    // Mock peekMany to return existing items
    vi.doMock('../query', () => ({
      peekMany: vi.fn(() => ({ result: [existingItem] })),
    }))

    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(updatedItem)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany({ ...options, items: [mockItems[0]!] })

    expect(result).toEqual([{
      ...existingItem,
      ...updatedItem,
    }])
  })

  it('should sort result to match input order', async () => {
    const resultItems = [
      { id: '2', name: 'item2' },
      { id: '1', name: 'item1' },
    ] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany(options)

    // Should match input order [id: '1', id: '2']
    expect(result[0]!.id).toBe('1')
    expect(result[1]!.id).toBe('2')
  })

  it('should handle items without existing cache entries when not optimistic', async () => {
    const resultItems = [{ id: '1', name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockStore.$cache.readItem = vi.fn(() => null as any)

    const result = await updateMany({ ...options, optimistic: false })

    expect(result).toEqual(resultItems)
    expect(mockStore.$cache.addLayer).not.toHaveBeenCalled()
  })

  describe('check for undefined keys', () => {
    it('should not throw for falsy keys', async () => {
      const resultItems = [{ id: 0, name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
      mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
      mockCollection.getKey = vi.fn(() => 0)
      mockStore.$cache.readItem = vi.fn(() => null as any)

      const result = await updateMany({ ...options, items: [{ id: 0, name: 'updated-item1' }] })

      expect(result).toEqual(resultItems)
      expect(mockStore.$cache.writeItems).toHaveBeenCalled()
    })

    it('should throw if key is undefined', async () => {
      const resultItems = [{ name: 'updated-item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
      mockStore.$hooks.hook('updateMany', vi.fn(({ setResult }) => setResult(resultItems)))
      mockCollection.getKey = vi.fn(() => undefined)
      mockStore.$cache.readItem = vi.fn(() => null as any)

      await expect(updateMany({ ...options, items: [{ name: 'updated-item1' }] })).rejects.toThrow('Item update failed: key is not defined')
    })
  })
})
