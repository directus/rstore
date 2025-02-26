import type { Model, ModelDefaults, ModelType, ResolvedModelItem, ResolvedModelType, StoreCore } from '@rstore/shared'
import type { UpdateOptions } from '../../src/mutation/update'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateItem } from '../../src/mutation/update'

vi.mock('../../src/query/peekFirst', () => ({
  peekFirst: vi.fn(() => ({ result: null })),
}))

describe('updateItem', () => {
  let mockStore: StoreCore<Model, ModelDefaults>
  let mockType: ResolvedModelType<ModelType, ModelDefaults>
  let mockItem: Partial<ResolvedModelItem<ModelType, ModelDefaults, Model>>
  let options: UpdateOptions<ModelType, ModelDefaults, Model>

  beforeEach(() => {
    mockStore = {
      hooks: {
        callHook: vi.fn(),
      },
      processItemParsing: vi.fn(),
      cache: {
        writeItem: vi.fn(),
      },
      mutationHistory: [],
    } as unknown as StoreCore<Model, ModelDefaults>

    mockType = {
      getKey: vi.fn(item => item.id),
    } as unknown as ResolvedModelType<ModelType, ModelDefaults>

    mockItem = {}

    options = {
      store: mockStore,
      type: mockType,
      item: mockItem,
      skipCache: false,
    }
  })

  it('should update an item and write it to the cache', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<ModelType, ModelDefaults, Model>
    mockStore.hooks.callHook = vi.fn(async (hookName, { setResult }) => setResult(resultItem)) as any
    mockType.getKey = vi.fn(() => '1')

    const result = await updateItem(options)

    expect(result).toEqual(resultItem)
    expect(mockStore.processItemParsing).toHaveBeenCalledWith(mockType, resultItem)
    expect(mockStore.cache.writeItem).toHaveBeenCalledWith({
      type: mockType,
      key: '1',
      item: resultItem,
    })
    expect(mockStore.mutationHistory).toContainEqual({
      operation: 'update',
      type: mockType,
      key: '1',
      payload: mockItem,
    })
  })

  it('should throw an error if result is nullish', async () => {
    mockStore.hooks.callHook = vi.fn(async () => {}) as any
    mockItem.id = '1'

    await expect(updateItem(options)).rejects.toThrow('Item update failed: result is nullish')
  })

  it('should throw an error if key is not defined', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<ModelType, ModelDefaults, Model>
    mockStore.hooks.callHook = vi.fn(async (hookName, { setResult }) => setResult(resultItem)) as any
    mockType.getKey = vi.fn(() => undefined)

    await expect(updateItem(options)).rejects.toThrow('Item update failed: key is not defined')
  })

  it('should skip cache if skipCache is true', async () => {
    const resultItem = { id: '1' } as ResolvedModelItem<ModelType, ModelDefaults, Model>
    mockStore.hooks.callHook = vi.fn(async (hookName, { setResult }) => setResult(resultItem)) as any
    mockType.getKey = vi.fn(() => '1')

    const result = await updateItem({ ...options, skipCache: true })

    expect(result).toEqual(resultItem)
    expect(mockStore.processItemParsing).toHaveBeenCalledWith(mockType, resultItem)
    expect(mockStore.cache.writeItem).not.toHaveBeenCalled()
    expect(mockStore.mutationHistory).toContainEqual({
      operation: 'update',
      type: mockType,
      key: '1',
      payload: mockItem,
    })
  })
})
