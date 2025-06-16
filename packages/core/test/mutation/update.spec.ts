import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem, StoreCore } from '@rstore/shared'
import type { UpdateOptions } from '../../src/mutation/update'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateItem } from '../../src/mutation/update'

vi.mock('../../src/query/peekFirst', () => ({
  peekFirst: vi.fn(() => ({ result: null })),
}))

describe('updateItem', () => {
  let mockStore: StoreCore<ModelList, ModelDefaults>
  let mockModel: ResolvedModel<Model, ModelDefaults, ModelList>
  let mockItem: Partial<ResolvedModelItem<Model, ModelDefaults, ModelList>>
  let options: UpdateOptions<Model, ModelDefaults, ModelList>

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $processItemParsing: vi.fn(),
      $processItemSerialization: vi.fn(),
      $cache: {
        writeItem: vi.fn(),
      },
      $mutationHistory: [],
    } as unknown as StoreCore<ModelList, ModelDefaults>

    mockModel = {
      getKey: vi.fn(item => item.id),
    } as unknown as ResolvedModel<Model, ModelDefaults, ModelList>

    mockItem = {}

    options = {
      store: mockStore,
      model: mockModel,
      item: mockItem,
      skipCache: false,
    }
  })

  it('should update an item and write it to the cache', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => '1')

    const result = await updateItem(options)

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockModel, resultItem)
    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith({
      model: mockModel,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      model: mockModel,
      key: '1',
      payload: mockItem,
    })
  })

  it('should update an item with specific key', async () => {
    const resultItem = { id: '1', text: 'foo' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockItem.text = 'foo'

    const result = await updateItem({
      ...options,
      key: '1',
    })

    expect(result).toEqual(resultItem)
    expect(mockStore.$cache.writeItem).toHaveBeenCalledWith({
      model: mockModel,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      model: mockModel,
      key: '1',
      payload: mockItem,
    })
  })

  it('should throw an error if result is nullish', async () => {
    mockItem.id = '1'

    await expect(updateItem(options)).rejects.toThrow('Item update failed: result is nullish')
  })

  it('should throw an error if key is not defined', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => undefined)

    await expect(updateItem(options)).rejects.toThrow('Item update failed: key is not defined')
  })

  it('should skip cache if skipCache is true', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    mockStore.$hooks.hook('updateItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => '1')

    const result = await updateItem({ ...options, skipCache: true })

    expect(result).toEqual(resultItem)
    expect(mockStore.$processItemParsing).toHaveBeenCalledWith(mockModel, resultItem)
    expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
    expect(mockStore.$mutationHistory).toContainEqual({
      operation: 'update',
      model: mockModel,
      key: '1',
      payload: mockItem,
    })
  })

  it('should serialize item before processing', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    let payloadItem: any
    mockStore.$hooks.hook('updateItem', vi.fn(({ item, setResult }) => {
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

    await updateItem(options)

    expect(mockStore.$processItemSerialization).toHaveBeenCalled()
    expect(processItemSerializationPayloadItem).toEqual({ text: 'test' })
    expect(payloadItem).toEqual({ text: 'test', serialized: true })
  })
})
