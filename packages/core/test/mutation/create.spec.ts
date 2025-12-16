import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import type { CreateOptions } from '../../src/mutation/create'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createItem } from '../../src/mutation/create'

describe('createItem', () => {
  let mockStore: StoreCore<StoreSchema, CollectionDefaults>
  let mockCollection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  let mockItem: Partial<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
  let options: CreateOptions<Collection, CollectionDefaults, StoreSchema>

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      processItemParsing: vi.fn(),
      $cache: {
        writeItem: vi.fn(),
        readItem: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
      },
      $mutationHistory: [],
      $processItemParsing: vi.fn(),
      $processItemSerialization: vi.fn(),
    } as unknown as StoreCore<StoreSchema, CollectionDefaults>

    mockCollection = {
      getKey: vi.fn(),
    } as unknown as ResolvedCollection<Collection, CollectionDefaults, StoreSchema>

    mockItem = {}

    options = {
      store: mockStore,
      collection: mockCollection,
      item: mockItem,
      skipCache: false,
    }
  })

  it('should create an item and write it to the cache', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockCollection.getKey = vi.fn(() => '1')

    const result = await createItem(options)

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockCollection, resultItem)
    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith({
      collection: mockCollection,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: mockCollection,
      payload: mockItem,
    })
  })

  it('should throw an error if result is nullish', async () => {
    mockStore.$hooks.callHook = vi.fn(async () => {}) as any

    await expect(createItem(options)).rejects.toThrow('Item creation failed: result is nullish')
  })

  it('should throw an error if key is not defined', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockCollection.getKey = vi.fn(() => undefined)

    await expect(createItem(options)).rejects.toThrow('Item creation failed: key is not defined')
  })

  it('should skip cache if skipCache is true', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockCollection.getKey = vi.fn(() => '1')

    const result = await createItem({ ...options, skipCache: true })

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockCollection, resultItem)
    expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: mockCollection,
      payload: mockItem,
    })
  })

  it('should serialize item before processing', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    let payloadItem: any
    mockStore.$hooks.hook('createItem', vi.fn(({ item, setResult }) => {
      payloadItem = item
      setResult(resultItem)
    }))
    mockCollection.getKey = vi.fn(() => '1')
    Object.assign(mockItem, { text: 'test' })
    let processItemSerializationPayloadItem: any = null
    mockStore.$processItemSerialization = vi.fn((collection, item) => {
      processItemSerializationPayloadItem = structuredClone(item)
      item.serialized = true
    })

    await createItem(options)

    expect(mockStore.$processItemSerialization).toHaveBeenCalled()
    expect(processItemSerializationPayloadItem).toEqual({ text: 'test' })
    expect(payloadItem).toEqual({ text: 'test', serialized: true })
  })

  it('should auto abort when calling setResult with a non-nullish value', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    const hook1 = vi.fn(({ setResult }) => {
      setResult(resultItem)
    })
    const hook2 = vi.fn(({ setResult }) => {
      setResult({ id: '2' } as any)
    })
    mockStore.$hooks.hook('createItem', hook1)
    mockStore.$hooks.hook('createItem', hook2)
    mockCollection.getKey = vi.fn(() => '1')

    const result = await createItem(options)

    expect(result).toEqual(resultItem)
    expect(hook1).toHaveBeenCalled()
    expect(hook2).not.toHaveBeenCalled()
  })

  it('should not abort with the options.abort set to false', async () => {
    const resultItem1 = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    const resultItem2 = { id: '2' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    const hook1 = vi.fn(({ setResult }) => {
      setResult(resultItem1, { abort: false })
    })
    const hook2 = vi.fn(({ setResult }) => {
      setResult(resultItem2)
    })
    mockStore.$hooks.hook('createItem', hook1)
    mockStore.$hooks.hook('createItem', hook2)
    mockCollection.getKey = vi.fn(() => '2')

    const result = await createItem(options)

    expect(result).toEqual(resultItem2)
    expect(hook1).toHaveBeenCalled()
    expect(hook2).toHaveBeenCalled()
  })

  it('should not abort when calling setResult with a nullish value', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    const hook1 = vi.fn(({ setResult }) => {
      setResult(null)
    })
    const hook2 = vi.fn(({ setResult }) => {
      setResult(resultItem)
    })
    mockStore.$hooks.hook('createItem', hook1)
    mockStore.$hooks.hook('createItem', hook2)
    mockCollection.getKey = vi.fn(() => '1')

    const result = await createItem(options)

    expect(result).toEqual(resultItem)
    expect(hook1).toHaveBeenCalled()
    expect(hook2).toHaveBeenCalled()
  })

  it('should abort when calling abort()', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    const hook1 = vi.fn(({ setResult, abort }) => {
      setResult(resultItem)
      abort()
    })
    const hook2 = vi.fn(({ setResult }) => {
      setResult({ id: '2' } as any)
    })
    mockStore.$hooks.hook('createItem', hook1)
    mockStore.$hooks.hook('createItem', hook2)
    mockCollection.getKey = vi.fn(() => '1')

    const result = await createItem(options)

    expect(result).toEqual(resultItem)
    expect(hook1).toHaveBeenCalled()
    expect(hook2).not.toHaveBeenCalled()
  })

  describe('check for undefined key', () => {
    it('should handle falsy key', async () => {
      const resultItem = { id: 0 } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
      mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
      mockCollection.getKey = vi.fn(() => 0)

      const result = await createItem(options)
      expect(result).toEqual(resultItem)
      expect(mockStore.$cache.writeItem).toHaveBeenCalled()
    })

    it('should throw if key is undefined', async () => {
      const resultItem = { id: undefined } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
      mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
      mockCollection.getKey = vi.fn(() => undefined)

      await expect(createItem(options)).rejects.toThrow('Item creation failed: key is not defined')
    })
  })
})
