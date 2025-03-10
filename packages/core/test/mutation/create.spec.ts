import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem, StoreCore } from '@rstore/shared'
import type { CreateOptions } from '../../src/mutation/create'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createItem } from '../../src/mutation/create'

describe('createItem', () => {
  let mockStore: StoreCore<ModelList, ModelDefaults>
  let mockModel: ResolvedModel<Model, ModelDefaults, ModelList>
  let mockItem: Partial<ResolvedModelItem<Model, ModelDefaults, ModelList>>
  let options: CreateOptions<Model, ModelDefaults, ModelList>

  beforeEach(() => {
    mockStore = {
      hooks: createHooks(),
      processItemParsing: vi.fn(),
      cache: {
        writeItem: vi.fn(),
      },
      mutationHistory: [],
    } as unknown as StoreCore<ModelList, ModelDefaults>

    mockModel = {
      getKey: vi.fn(),
    } as unknown as ResolvedModel<Model, ModelDefaults, ModelList>

    mockItem = {}

    options = {
      store: mockStore,
      model: mockModel,
      item: mockItem,
      skipCache: false,
    }
  })

  it('should create an item and write it to the cache', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    mockStore.hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => '1')

    const result = await createItem(options)

    expect(result).toEqual(resultItem)
    expect(mockStore.processItemParsing).toHaveBeenCalledWith(mockModel, resultItem)
    expect(mockStore.cache.writeItem).toHaveBeenCalledWith({
      model: mockModel,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.mutationHistory).toContainEqual({
      operation: 'create',
      model: mockModel,
      payload: mockItem,
    })
  })

  it('should throw an error if result is nullish', async () => {
    mockStore.hooks.callHook = vi.fn(async () => {}) as any

    await expect(createItem(options)).rejects.toThrow('Item creation failed: result is nullish')
  })

  it('should throw an error if key is not defined', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    mockStore.hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => undefined)

    await expect(createItem(options)).rejects.toThrow('Item creation failed: key is not defined')
  })

  it('should skip cache if skipCache is true', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<Model, ModelDefaults, ModelList>
    mockStore.hooks.hook('createItem', vi.fn(({ setResult }) => setResult(resultItem)))
    mockModel.getKey = vi.fn(() => '1')

    const result = await createItem({ ...options, skipCache: true })

    expect(result).toEqual(resultItem)
    expect(mockStore.processItemParsing).toHaveBeenCalledWith(mockModel, resultItem)
    expect(mockStore.cache.writeItem).not.toHaveBeenCalled()
    expect(mockStore.mutationHistory).toContainEqual({
      operation: 'create',
      model: mockModel,
      payload: mockItem,
    })
  })
})
