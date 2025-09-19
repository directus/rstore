import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import type { CreateManyOptions } from '../../src/mutation/createMany'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMany } from '../../src/mutation/createMany'

describe('createMany', () => {
  let mockStore: StoreCore<StoreSchema, CollectionDefaults>
  let mockCollection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  let mockItems: Array<Partial<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>>
  let options: CreateManyOptions<Collection, CollectionDefaults, StoreSchema>
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
        writeItems: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
      },
      $mutationHistory: [],
      $processItemParsing: vi.fn(),
      $processItemSerialization: vi.fn(),
    } as unknown as StoreCore<StoreSchema, CollectionDefaults>

    mockCollection = {
      name: 'testCollection',
      getKey: vi.fn(),
    } as unknown as ResolvedCollection<Collection, CollectionDefaults, StoreSchema>

    mockItems = [
      { id: '1', name: 'item1' },
      { id: '2', name: 'item2' },
    ] as Array<Partial<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>>

    options = {
      store: mockStore,
      collection: mockCollection,
      items: mockItems,
      skipCache: false,
      optimistic: true,
    }
  })

  it('should create multiple items and write them to the cache', async () => {
    const resultItems = [
      { id: '1', name: 'item1' },
      { id: '2', name: 'item2' },
    ] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(item => item.id)

    const result = await createMany(options)

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
      operation: 'create',
      collection: mockCollection,
      payload: expect.any(Array),
    })
  })

  it('should fall back to individual createItem hooks when createMany is not handled', async () => {
    const resultItem1 = { id: '1', name: 'item1' } as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    const resultItem2 = { id: '2', name: 'item2' } as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>

    mockStore.$hooks.hook('createItem', vi.fn(({ item, setResult }) => {
      if (item.id === '1')
        setResult(resultItem1)
      if (item.id === '2')
        setResult(resultItem2)
    }))
    mockCollection.getKey = vi.fn(item => item.id)

    const result = await createMany(options)

    expect(result).toEqual([resultItem1, resultItem2])
    expect(mockStore.$processItemParsing).toHaveBeenCalledTimes(2)
  })

  it('should handle optimistic updates with cache layer', async () => {
    const resultItems = [
      { id: '1', name: 'item1' },
      { id: '2', name: 'item2' },
    ] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(item => item.id || mockRandomUUID())

    await createMany(options)

    expect(mockStore.$cache.addLayer).toHaveBeenCalledWith({
      id: 'mock-uuid-1',
      state: {
        testCollection: {
          1: { ...mockItems[0], $overrideKey: '1' },
          2: { ...mockItems[1], $overrideKey: '2' },
        },
      },
      deletedItems: {},
      optimistic: true,
      prevent: {
        update: true,
        delete: true,
      },
    })
    expect(mockStore.$cache.removeLayer).toHaveBeenCalledWith('mock-uuid-1')
  })

  it('should handle optimistic updates with custom optimistic data', async () => {
    const resultItems = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const optimisticData = { loading: true }

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => '1')

    await createMany({ ...options, items: [mockItems[0]!], optimistic: optimisticData })

    expect(mockStore.$cache.addLayer).toHaveBeenCalledWith({
      id: 'mock-uuid-1',
      state: {
        testCollection: {
          1: { ...mockItems[0], ...optimisticData, $overrideKey: '1' },
        },
      },
      deletedItems: {},
      optimistic: true,
      prevent: {
        update: true,
        delete: true,
      },
    })
  })

  it('should skip cache when skipCache is true', async () => {
    const resultItems = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => '1')

    const result = await createMany({ ...options, skipCache: true })

    expect(result).toEqual(resultItems)
    expect(mockStore.$cache.addLayer).not.toHaveBeenCalled()
    expect(mockStore.$cache.writeItems).not.toHaveBeenCalled()
  })

  it('should skip optimistic updates when optimistic is false', async () => {
    const resultItems = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => '1')

    await createMany({ ...options, optimistic: false })

    expect(mockStore.$cache.addLayer).not.toHaveBeenCalled()
    expect(mockStore.$cache.writeItems).toHaveBeenCalled()
  })

  it('should handle items without keys by generating UUIDs for optimistic state', async () => {
    const resultItems = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => undefined)

    await createMany(options)

    expect(mockRandomUUID).toHaveBeenCalled()
    expect(mockStore.$cache.addLayer).toHaveBeenCalledWith({
      id: 'mock-uuid-3',
      state: {
        testCollection: {
          'mock-uuid-1': { ...mockItems[0], $overrideKey: 'mock-uuid-1' },
          'mock-uuid-2': { ...mockItems[1], $overrideKey: 'mock-uuid-2' },
        },
      },
      deletedItems: {},
      optimistic: true,
      prevent: {
        update: true,
        delete: true,
      },
    })
  })

  it('should warn and skip items without keys when writing to cache', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const resultItems = [{ name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => undefined)

    await createMany(options)

    expect(consoleSpy).toHaveBeenCalledWith('Key is undefined for testCollection. Item was not written to cache.')
    expect(mockStore.$cache.writeItems).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('should serialize items before processing', async () => {
    const resultItems = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => '1')

    await createMany(options)

    expect(mockStore.$processItemSerialization).toHaveBeenCalledTimes(2)
    expect(mockStore.$processItemSerialization).toHaveBeenCalledWith(mockCollection, mockItems[0])
    expect(mockStore.$processItemSerialization).toHaveBeenCalledWith(mockCollection, mockItems[1])
  })

  it('should call beforeManyMutation and afterManyMutation hooks', async () => {
    const beforeHook = vi.fn()
    const afterHook = vi.fn()
    const resultItems = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('beforeManyMutation', beforeHook)
    mockStore.$hooks.hook('afterManyMutation', afterHook)
    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => '1')

    await createMany(options)

    expect(beforeHook).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'create',
      items: expect.any(Array),
      setItems: expect.any(Function),
    })
    expect(afterHook).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'create',
      items: expect.any(Array),
      getResult: expect.any(Function),
      setResult: expect.any(Function),
    })
  })

  it('should call afterMutation hook for each item when falling back to individual creates', async () => {
    const afterMutationHook = vi.fn()
    const resultItem = { id: '1', name: 'item1' } as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>

    mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockStore.$hooks.hook('afterMutation', afterMutationHook)
    mockCollection.getKey = vi.fn(() => '1')

    await createMany({ ...options, items: [mockItems[0]!] })

    expect(afterMutationHook).toHaveBeenCalledWith({
      store: mockStore,
      meta: {},
      collection: mockCollection,
      mutation: 'create',
      item: expect.any(Object),
      getResult: expect.any(Function),
      setResult: expect.any(Function),
    })
  })

  it('should auto abort when createMany setResult is called with non-empty result', async () => {
    const resultItems = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const createManyHook = vi.fn(({ setResult }) => setResult(resultItems))
    const createItemHook = vi.fn()

    mockStore.$hooks.hook('createMany', createManyHook)
    mockStore.$hooks.hook('createItem', createItemHook)
    mockCollection.getKey = vi.fn(() => '1')

    await createMany(options)

    expect(createManyHook).toHaveBeenCalled()
    expect(createItemHook).not.toHaveBeenCalled()
  })

  it('should not abort when createMany setResult is called with abort: false', async () => {
    const resultItems1 = [{ id: '1', name: 'item1' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const resultItems2 = [{ id: '2', name: 'item2' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
    const hook1 = vi.fn(({ setResult }) => setResult(resultItems1, { abort: false }))
    const hook2 = vi.fn(({ setResult }) => setResult(resultItems2))

    mockStore.$hooks.hook('createMany', hook1)
    mockStore.$hooks.hook('createMany', hook2)
    mockCollection.getKey = vi.fn(item => item.id)

    const result = await createMany(options)

    expect(hook1).toHaveBeenCalled()
    expect(hook2).toHaveBeenCalled()
    expect(result).toEqual(resultItems2)
  })

  it('should rollback optimistic layer on error', async () => {
    const error = new Error('Test error')
    mockStore.$hooks.hook('createMany', vi.fn(() => {
      throw error
    }))
    mockCollection.getKey = vi.fn(() => '1')

    await expect(createMany(options)).rejects.toThrow('Test error')

    expect(mockStore.$cache.addLayer).toHaveBeenCalled()
    expect(mockStore.$cache.removeLayer).toHaveBeenCalledWith('mock-uuid-1')
  })

  it('should handle empty result array', async () => {
    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult([])))

    const result = await createMany(options)

    expect(result).toEqual([])
    expect(mockStore.$processItemParsing).not.toHaveBeenCalled()
    expect(mockStore.$cache.writeItems).not.toHaveBeenCalled()
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: mockCollection,
      payload: expect.any(Array),
    })
  })

  it('should handle items modification in beforeManyMutation hook', async () => {
    const modifiedItems = [{ id: '3', name: 'modified' }]
    const resultItems = [{ id: '3', name: 'modified' }] as Array<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>

    mockStore.$hooks.hook('beforeManyMutation', vi.fn(({ setItems }) => setItems(modifiedItems)))
    mockStore.$hooks.hook('createMany', vi.fn(({ setResult }) => setResult(resultItems)))
    mockCollection.getKey = vi.fn(() => '3')

    const result = await createMany(options)

    expect(result).toEqual(resultItems)
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: mockCollection,
      payload: modifiedItems,
    })
  })
})
