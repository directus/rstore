import type { Model, ModelDefaults, ResolvedModel, ResolvedModelItem, StoreCore, StoreSchema } from '@rstore/shared'
import type { CreateOptions } from '../../src/mutation/create'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createItem } from '../../src/mutation/create'

describe('createItem', () => {
  let mockStore: StoreCore<StoreSchema, ModelDefaults>
  let mockModel: ResolvedModel<Model, ModelDefaults, StoreSchema>
  let mockItem: Partial<ResolvedModelItem<Model, ModelDefaults, StoreSchema>>
  let options: CreateOptions<Model, ModelDefaults, StoreSchema>

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
    } as unknown as StoreCore<StoreSchema, ModelDefaults>

    mockModel = {
      getKey: vi.fn(),
    } as unknown as ResolvedModel<Model, ModelDefaults, StoreSchema>

    mockItem = {}

    options = {
      store: mockStore,
      model: mockModel,
      item: mockItem,
      skipCache: false,
    }
  })

  it('should create an item and write it to the cache', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedModelItem<Model, ModelDefaults, StoreSchema>
    mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => '1')

    const result = await createItem(options)

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockModel, resultItem)
    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith({
      model: mockModel,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'create',
      model: mockModel,
      payload: mockItem,
    })
  })

  it('should throw an error if result is nullish', async () => {
    mockStore.$hooks.callHook = vi.fn(async () => {}) as any

    await expect(createItem(options)).rejects.toThrow('Item creation failed: result is nullish')
  })

  it('should throw an error if key is not defined', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedModelItem<Model, ModelDefaults, StoreSchema>
    mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => undefined)

    await expect(createItem(options)).rejects.toThrow('Item creation failed: key is not defined')
  })

  it('should skip cache if skipCache is true', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedModelItem<Model, ModelDefaults, StoreSchema>
    mockStore.$hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => '1')

    const result = await createItem({ ...options, skipCache: true })

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockModel, resultItem)
    expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'create',
      model: mockModel,
      payload: mockItem,
    })
  })

  it('should serialize item before processing', async () => {
    const resultItem = { id: '1' } as unknown as ResolvedModelItem<Model, ModelDefaults, StoreSchema>
    let payloadItem: any
    mockStore.$hooks.hook('createItem', vi.fn(({ item, setResult }) => {
      payloadItem = item
      setResult(resultItem)
    }))
    mockModel.getKey = vi.fn(() => '1')
    Object.assign(mockItem, { text: 'test' })
    let processItemSerializationPayloadItem: any = null
    mockStore.$processItemSerialization = vi.fn((model, item) => {
      processItemSerializationPayloadItem = structuredClone(item)
      item.serialized = true
    })

    await createItem(options)

    expect(mockStore.$processItemSerialization).toHaveBeenCalled()
    expect(processItemSerializationPayloadItem).toEqual({ text: 'test' })
    expect(payloadItem).toEqual({ text: 'test', serialized: true })
  })
})
