import type { VueStore } from '../src/store'
import { emptySchemas, peekMany } from '@rstore/core'
import { createHooks, type ResolvedModel, type StandardSchemaV1 } from '@rstore/shared'
import { beforeEach, describe, expect, it, type Mock, type MockedFunction, vi } from 'vitest'
import { markRaw, ref } from 'vue'
import { wrapItem, type WrappedItemMetadata } from '../src/item'

vi.mock('@rstore/core', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    peekFirst: vi.fn(),
    peekMany: vi.fn(),
  }
})

type Schema = [
  { name: 'testModel' },
  { name: 'relatedModel' },
]

describe('wrapItem', () => {
  let mockStore: VueStore<Schema, any>

  let mockModel: ResolvedModel & {
    getKey: Mock<ResolvedModel['getKey']>
    computed: {
      computedProp: Mock<() => any>
    }
  }

  let mockItem: any

  function createMetadata(): WrappedItemMetadata<any, any, any> {
    return {
      queries: new Set(),
      dirtyQueries: new Set(),
    }
  }

  beforeEach(() => {
    mockModel = {
      '~resolved': true,
      'name': 'testModel',
      'getKey': vi.fn(item => item.id),
      'computed': {
        computedProp: vi.fn(),
      },
      'relations': {
        relatedItems: {
          to: {
            relatedModel: { on: { foreignKey: 'id' } },
          },
          many: true,
        },
      },
      'fields': {},
      'formSchema': emptySchemas,
      'isInstanceOf': () => true,
    }

    mockStore = {
      $models: [
        mockModel,
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

    mockItem = ref({
      id: 1,
      foreignKey: 2,
    })
  })

  it('should return a proxy with $model property', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() })
    expect(wrappedItem.$model).toBe('testModel')
  })

  it('should return the key using $getKey', () => {
    mockModel.getKey.mockReturnValue('itemKey')
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() })
    expect(wrappedItem.$getKey()).toBe('itemKey')
  })

  it('should throw an error if key is undefined in $getKey', () => {
    mockModel.getKey.mockReturnValue(undefined)
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() })
    expect(() => wrappedItem.$getKey()).toThrow('Key is undefined on item')
  })

  it('should call updateForm with correct arguments in $updateForm', async () => {
    const mockForm = { $schema: null }
    ;(mockStore.testModel.updateForm as MockedFunction<any>).mockResolvedValue(mockForm)
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() })
    const schema = { type: 'object' } as unknown as StandardSchemaV1
    const form = await wrappedItem.$updateForm({ schema })
    expect(mockStore.testModel.updateForm).toHaveBeenCalledWith(
      { key: 1 },
      { defaultValues: undefined },
    )
    expect(form.$schema).toBe(markRaw(schema))
  })

  it('should call update with correct arguments in $update', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() })
    wrappedItem.$update({ name: 'updatedName' })
    expect(mockStore.testModel.update).toHaveBeenCalledWith(
      { name: 'updatedName' },
      { key: 1 },
    )
  })

  it('should call delete with correct arguments in $delete', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() })
    wrappedItem.$delete()
    expect(mockStore.testModel.delete).toHaveBeenCalledWith(1)
  })

  it('should resolve computed properties', () => {
    mockModel.computed.computedProp.mockReturnValue('computedValue')
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() }) as any
    expect(wrappedItem.computedProp).toBe('computedValue')
  })

  it('should resolve related items in the cache', () => {
    const relatedItems = [
      { id: 2, foreignKey: 1 },
      { id: 3, foreignKey: 1 },
      { id: 4, foreignKey: 2 },
    ] as any[]
    ;(peekMany as MockedFunction<typeof peekMany>).mockImplementation(({ findOptions }) => {
      const filter = findOptions!.filter as (item: any) => boolean
      return {
        result: relatedItems.filter(filter),
      }
    })
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() }) as any
    expect(wrappedItem.relatedItems.length).toBe(2)
    expect(wrappedItem.relatedItems[0].id).toBe(2)
    expect(wrappedItem.relatedItems[1].id).toBe(3)
  })

  it('should resolve related items with multiple foreign keys', () => {
    mockModel.relations.relatedItems!.to.relatedModel!.on = {
      'relatedModel.foreignKey1': 'testModel.id1',
      'foreignKey2': 'id2',
    }
    mockItem = ref({
      id1: 1,
      id2: 2,
    })
    const relatedItems = [
      { meow: 'meow', foreignKey1: 1, foreignKey2: 2 },
      { meow: 'purr', foreignKey1: 1, foreignKey2: 3 },
    ] as any[]
    ;(peekMany as MockedFunction<typeof peekMany>).mockImplementation(({ findOptions }) => {
      const filter = findOptions!.filter as (item: any) => boolean
      return {
        result: relatedItems.filter(filter),
      }
    })
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() }) as any
    expect(wrappedItem.relatedItems.length).toBe(1)
    expect(wrappedItem.relatedItems[0].meow).toBe('meow')
  })

  it('should throw an error when trying to set a property', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, model: mockModel, item: mockItem, metadata: createMetadata() })
    expect(() => {
      (wrappedItem as any).newProp = 'value'
    }).toThrow('Items are read-only. Use `item.$updateForm()` to update the item.')
  })
})
