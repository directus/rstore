import type { VueStore } from '../src'
import { peekMany } from '@rstore/core'
import { createHooks, type ResolvedModel, type StandardSchemaV1 } from '@rstore/shared'
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest'
import { markRaw } from 'vue'
import { wrapItem } from '../src/item'

vi.mock('@rstore/core', () => {
  return {
    peekFirst: vi.fn(),
    peekMany: vi.fn(),
  }
})

describe('wrapItem', () => {
  let mockStore: VueStore

  let mockModel: ResolvedModel<any, any, any>

  let mockItem: any

  beforeEach(() => {
    mockStore = {
      $models: [
        { name: 'relatedModel', getKey: vi.fn(), computed: {}, relations: {} },
      ],
      $getFetchPolicy: () => 'cache-first',
      $hooks: createHooks(),
      relatedModel: {
        peekMany: vi.fn(),
      },
      testModel: {
        updateForm: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    } as any

    mockModel = {
      name: 'testModel',
      getKey: vi.fn(item => item.id),
      computed: {
        computedProp: vi.fn(),
      },
      relations: {
        relatedItems: {
          to: {
            relatedModel: { eq: 'id', on: 'foreignKey' },
          },
          many: true,
        },
      },
    } as any

    mockItem = {
      id: 1,
      foreignKey: 2,
    }
  })

  it('should return a proxy with $model property', () => {
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem })
    expect(wrappedItem.$model).toBe('testModel')
  })

  it('should return the key using $getKey', () => {
    mockModel.getKey.mockReturnValue('itemKey')
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem })
    expect(wrappedItem.$getKey()).toBe('itemKey')
  })

  it('should throw an error if key is undefined in $getKey', () => {
    mockModel.getKey.mockReturnValue(undefined)
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem })
    expect(() => wrappedItem.$getKey()).toThrow('Key is undefined on item')
  })

  it('should call updateForm with correct arguments in $updateForm', async () => {
    const mockForm = { $schema: null }
    ;(mockStore.testModel.updateForm as MockedFunction<any>).mockResolvedValue(mockForm)
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem })
    const schema = { type: 'object' } as unknown as StandardSchemaV1
    const form = await wrappedItem.$updateForm({ schema })
    expect(mockStore.testModel.updateForm).toHaveBeenCalledWith(
      { key: 1 },
      { defaultValues: undefined },
    )
    expect(form.$schema).toBe(markRaw(schema))
  })

  it('should call update with correct arguments in $update', () => {
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem })
    wrappedItem.$update({ name: 'updatedName' })
    expect(mockStore.testModel.update).toHaveBeenCalledWith(
      { name: 'updatedName' },
      { key: 1 },
    )
  })

  it('should call delete with correct arguments in $delete', () => {
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem })
    wrappedItem.$delete()
    expect(mockStore.testModel.delete).toHaveBeenCalledWith(1)
  })

  it('should resolve computed properties', () => {
    mockModel.computed.computedProp.mockReturnValue('computedValue')
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem }) as any
    expect(wrappedItem.computedProp).toBe('computedValue')
  })

  it('should resolve related items in the cache', () => {
    const relatedItem = { id: 2, foreignKey: 1 }
    mockStore.$models[0].relations.relatedItems = {
      to: { relatedModel: { eq: 'id', on: 'foreignKey' } },
      many: true,
    }
    ;(peekMany as MockedFunction<any>).mockReturnValue({ result: [relatedItem] })
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem }) as any
    expect(wrappedItem.relatedItems).toEqual([relatedItem])
  })

  it('should throw an error when trying to set a property', () => {
    const wrappedItem = wrapItem({ store: mockStore, model: mockModel, item: mockItem })
    expect(() => {
      (wrappedItem as any).newProp = 'value'
    }).toThrow('Items are read-only. Use `item.$updateForm()` to update the item.')
  })
})
