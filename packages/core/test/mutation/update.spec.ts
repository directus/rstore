import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import type { UpdateOptions } from '../../src/mutation/update'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateItem } from '../../src/mutation/update'

vi.mock('../../src/query/peekFirst', () => ({
  peekFirst: vi.fn(() => ({ result: null })),
}))

describe('updateItem', () => {
  let mockStore: StoreCore<StoreSchema, CollectionDefaults>
  let mockCollection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  let mockItem: Partial<ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>>
  let options: UpdateOptions<Collection, CollectionDefaults, StoreSchema>

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $processItemParsing: vi.fn(),
      $processItemSerialization: vi.fn(),
      $cache: {
        writeItem: vi.fn(),
        readItem: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
      },
      $mutationHistory: [],
    } as unknown as StoreCore<StoreSchema, CollectionDefaults>

    mockCollection = {
      getKey: vi.fn(item => item.id),
    } as unknown as ResolvedCollection<Collection, CollectionDefaults, StoreSchema>

    mockItem = {}

    options = {
      store: mockStore,
      collection: mockCollection,
      item: mockItem,
      skipCache: false,
    }
  })

  it('should update an item and write it to the cache', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockCollection.getKey = vi.fn(() => '1')

    const result = await updateItem(options)

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockCollection, resultItem)
    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith({
      collection: mockCollection,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      collection: mockCollection,
      key: '1',
      payload: mockItem,
    })
  })

  it('should update an item with specific key', async () => {
    const resultItem = { id: '1', text: 'foo' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockItem.text = 'foo'

    const result = await updateItem({
      ...options,
      key: '1',
    })

    expect(result).toEqual(resultItem)
    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith({
      collection: mockCollection,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      collection: mockCollection,
      key: '1',
      payload: mockItem,
    })
  })

  it('should throw an error if result is nullish', async () => {
    mockItem.id = '1'

    await expect(updateItem(options)).rejects.toThrow('Item update failed: result is nullish')
  })

  it('should throw an error if key is not defined', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockCollection.getKey = vi.fn(() => undefined)

    await expect(updateItem(options)).rejects.toThrow('Item update failed: key is not defined')
  })

  it('should skip cache if skipCache is true', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockCollection.getKey = vi.fn(() => '1')

    const result = await updateItem({ ...options, skipCache: true })

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockCollection, resultItem)
    expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      collection: mockCollection,
      key: '1',
      payload: mockItem,
    })
  })

  it('should serialize item before processing', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
    let payloadItem: any
    mockStore.$hooks.hook('updateItem', vi.fn(({ item, setResult }) => {
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

    await updateItem(options)

    expect(mockStore.$processItemSerialization).toHaveBeenCalled()
    expect(processItemSerializationPayloadItem).toEqual({ text: 'test' })
    expect(payloadItem).toEqual({ text: 'test', serialized: true })
  })

  it('should auto abort when calling setResult with a non-nullish value', async () => {
    const hook1 = vi.fn(({ setResult }) => setResult({}))
    const hook2 = vi.fn()
    mockStore.$hooks.hook('updateItem', hook1)
    mockStore.$hooks.hook('updateItem', hook2)
    mockCollection.getKey = vi.fn(() => '1')

    await updateItem(options)

    expect(hook1).toHaveBeenCalled()
    expect(hook2).not.toHaveBeenCalled()
  })

  it('should not auto abort when calling setResult with a non-nullish value and options.abort is false', async () => {
    const hook1 = vi.fn(({ setResult }) => setResult({}, { abort: false }))
    const hook2 = vi.fn(({ setResult }) => setResult({ id: '2' } as any))
    mockStore.$hooks.hook('updateItem', hook1)
    mockStore.$hooks.hook('updateItem', hook2)
    mockCollection.getKey = vi.fn(() => '2')

    const result = await updateItem(options)

    expect(hook1).toHaveBeenCalled()
    expect(hook2).toHaveBeenCalled()
    expect(result).toEqual({ id: '2' })
  })

  it('should not auto abort when calling setResult with a nullish value', async () => {
    const hook1 = vi.fn(({ setResult }) => setResult(null))
    const hook2 = vi.fn(({ setResult }) => setResult({ id: '2' } as any))
    mockStore.$hooks.hook('updateItem', hook1)
    mockStore.$hooks.hook('updateItem', hook2)
    mockCollection.getKey = vi.fn(() => '2')

    const result = await updateItem(options)

    expect(hook1).toHaveBeenCalled()
    expect(hook2).toHaveBeenCalled()
    expect(result).toEqual({ id: '2' })
  })

  it('should abort when calling abort()', async () => {
    const hook1 = vi.fn(({ abort, setResult }) => {
      setResult({})
      abort()
    })
    const hook2 = vi.fn()
    mockStore.$hooks.hook('updateItem', hook1)
    mockStore.$hooks.hook('updateItem', hook2)
    mockCollection.getKey = vi.fn(() => '1')

    await updateItem(options)

    expect(hook1).toHaveBeenCalled()
    expect(hook2).not.toHaveBeenCalled()
  })

  describe('check for undefined keys', () => {
    it('should not throw for falsy keys', async () => {
      const resultItem = { id: 0 } as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
      mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
      mockCollection.getKey = vi.fn(() => 0)

      const result = await updateItem(options)

      expect(result).toEqual(resultItem)
      expect(mockStore.$cache.writeItem).toHaveBeenCalledWith({
        collection: mockCollection,
        key: 0,
        item: resultItem,
      })
    })

    it('should throw if key is undefined', async () => {
      const resultItem = {} as unknown as ResolvedCollectionItem<Collection, CollectionDefaults, StoreSchema>
      mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
      mockCollection.getKey = vi.fn(() => undefined)

      await expect(updateItem(options)).rejects.toThrow('Item update failed: key is not defined')
    })
  })
})
