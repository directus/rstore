import type { ResolvedModel } from '@rstore/shared'
import type { VueStore } from '../src'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'
import { createCache } from '../src/cache'

describe('cache', () => {
  const mockStore = {
    $hooks: {},
    $getModel: vi.fn(),
  } as unknown as VueStore

  const getStore = () => mockStore

  const mockModel = {
    name: 'TestModel',
    getKey: (item: any) => item.id,
    relations: {},
    computed: {},
  } as ResolvedModel

  const mockItem = { id: 1, name: 'Test Item' }

  beforeEach(() => {
    mockStore.$hooks = createHooks()
  })

  it('should write an item to the cache', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem })

    const state = cache.getState() as any
    expect(state.TestModel[1]).toEqual({ id: 1, name: 'Test Item' })
  })

  it('should not write special keys', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: {
      ...mockItem,
      $special: true,
    } })

    const state = cache.getState() as any
    expect(state.TestModel[1]).toEqual({ id: 1, name: 'Test Item' })
  })

  it('should read an item from the cache', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem })

    const result = cache.readItem({ model: mockModel, key: 1 })
    expect(result).toBeDefined()
    expect(result).toEqual(mockItem)
  })

  it('should return a wrapped item', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem })

    const result = cache.readItem({ model: mockModel, key: 1 })
    expect(result?.$model).toBe(mockModel.name)
  })

  it('should delete an item from the cache', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem })
    cache.deleteItem({ model: mockModel, key: 1 })

    const state = cache.getState() as any
    expect(state.TestModel).toEqual({})
  })

  it('should clear the cache', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem })
    cache.clear()

    const state = cache.getState()
    expect(state).toEqual({})
  })

  it('should handle relations when writing items', () => {
    const relationModel = {
      name: 'RelatedModel',
      getKey: (item: any) => item.id,
      relations: {},
      computed: {},
    }

    const mockModelWithRelation = {
      ...mockModel,
      relations: {
        related: { to: { RelatedModel: { on: { id: 'relatedId' } } }, many: false },
      },
      computed: {},
    }

    const relatedItem = { id: 2, name: 'Related Item' }
    const itemWithRelation = { id: 1, name: 'Test Item', relatedId: relatedItem.id, related: relatedItem }

    ;(mockStore.$getModel as MockedFunction<any>).mockReturnValue(relationModel)

    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModelWithRelation, key: 1, item: itemWithRelation })

    const state = cache.getState() as any
    expect(state.TestModel[1]).toEqual({ id: 1, name: 'Test Item', relatedId: 2 })
    expect(state.RelatedModel[2]).toEqual({ id: 2, name: 'Related Item' })
  })

  it('should mark a marker when writing items', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem, marker: 'testMarker' })

    const state = cache.getState() as any
    expect(state._markers.testMarker).toBe(true)
  })

  it('should read items by marker', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem, marker: 'testMarker' })

    const items = cache.readItems({ model: mockModel, marker: 'testMarker' })
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual(mockItem)
  })

  it('should not read items if marker is not set', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: mockItem, marker: 'testMarker' })

    const items = cache.readItems({ model: mockModel, marker: 'otherMarker' })
    expect(items).toHaveLength(0)
  })

  it('should filter the items', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: { id: 1, label: 'Meow' }, marker: 'testMarker' })
    cache.writeItem({ model: mockModel, key: 2, item: { id: 2, label: 'Woof' }, marker: 'testMarker' })

    const items = cache.readItems({ model: mockModel, marker: 'testMarker', filter: item => item.label === 'Meow' })
    const items2 = cache.readItems({ model: mockModel, marker: 'testMarker', filter: item => item.label === 'Woof' })

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ id: 1, label: 'Meow' })

    expect(items2).toHaveLength(1)
    expect(items2[0]).toEqual({ id: 2, label: 'Woof' })
  })

  it('should limit the number of items', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: { id: 1, label: 'Item 1' }, marker: 'testMarker' })
    cache.writeItem({ model: mockModel, key: 2, item: { id: 2, label: 'Item 2' }, marker: 'testMarker' })
    cache.writeItem({ model: mockModel, key: 3, item: { id: 3, label: 'Item 3' }, marker: 'testMarker' })

    const items = cache.readItems({ model: mockModel, marker: 'testMarker', limit: 2 })
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ id: 1, label: 'Item 1' })
    expect(items[1]).toEqual({ id: 2, label: 'Item 2' })
  })

  it('should filter and limit the items', () => {
    const cache = createCache({ getStore })
    cache.writeItem({ model: mockModel, key: 1, item: { id: 1, label: 'Meow' }, marker: 'testMarker' })
    cache.writeItem({ model: mockModel, key: 2, item: { id: 2, label: 'Woof' }, marker: 'testMarker' })
    cache.writeItem({ model: mockModel, key: 3, item: { id: 3, label: 'Meow' }, marker: 'testMarker' })

    const items = cache.readItems({ model: mockModel, marker: 'testMarker', filter: item => item.label === 'Meow', limit: 1 })
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ id: 1, label: 'Meow' })
  })
})
