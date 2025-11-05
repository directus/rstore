import type { VueStore } from '../src/store'
import { emptySchemas } from '@rstore/core'
import { createHooks, type ResolvedCollection, type StandardSchemaV1 } from '@rstore/shared'
import { beforeEach, describe, expect, it, type Mock, type MockedFunction, vi } from 'vitest'
import { markRaw, ref } from 'vue'
import { wrapItem, type WrappedItemMetadata } from '../src/item'

type Schema = [
  { name: 'testCollection' },
  { name: 'relatedCollection' },
]

describe('wrapItem', () => {
  let mockStore: VueStore<Schema, any>

  let mockCollection: ResolvedCollection & {
    getKey: Mock<ResolvedCollection['getKey']>
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
    mockCollection = {
      '~resolved': true,
      'hooks': undefined,
      'name': 'testCollection',
      'getKey': vi.fn(item => item.id),
      'computed': {
        computedProp: vi.fn(),
      },
      'relations': {
        relatedItems: {
          to: {
            relatedCollection: { on: { foreignKey: 'id' } },
          },
          many: true,
        },
      },
      'fields': {},
      'formSchema': emptySchemas,
      'isInstanceOf': () => true,
    }

    mockStore = {
      $collections: [
        mockCollection,
        { name: 'relatedCollection', getKey: vi.fn(), computed: {}, relations: {} },
      ],
      $getFetchPolicy: () => 'cache-first',
      $cache: {
        readItems: vi.fn(),
      },
      $hooks: createHooks(),
      relatedCollection: {
        peekMany: vi.fn(),
      },
      testCollection: {
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

  it('should return a proxy with $collection property', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) })
    expect(wrappedItem.$collection).toBe('testCollection')
  })

  it('should return the key using $getKey', () => {
    mockCollection.getKey.mockReturnValue('itemKey')
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) })
    expect(wrappedItem.$getKey()).toBe('itemKey')
  })

  it('should throw an error if key is undefined in $getKey', () => {
    mockCollection.getKey.mockReturnValue(undefined)
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) })
    expect(() => wrappedItem.$getKey()).toThrow('Key is undefined on item')
  })

  it('should call updateForm with correct arguments in $updateForm', async () => {
    const mockForm = { $schema: null }
    ;(mockStore.testCollection.updateForm as MockedFunction<any>).mockResolvedValue(mockForm)
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) })
    const schema = { type: 'object' } as unknown as StandardSchemaV1
    const form = await wrappedItem.$updateForm({ schema })
    expect(mockStore.testCollection.updateForm).toHaveBeenCalledWith(
      { key: 1 },
      { defaultValues: undefined },
    )
    expect(form.$schema).toBe(markRaw(schema))
  })

  it('should call update with correct arguments in $update', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) })
    wrappedItem.$update({ name: 'updatedName' })
    expect(mockStore.testCollection.update).toHaveBeenCalledWith(
      { name: 'updatedName' },
      { key: 1 },
    )
  })

  it('should call delete with correct arguments in $delete', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) })
    wrappedItem.$delete()
    expect(mockStore.testCollection.delete).toHaveBeenCalledWith(1)
  })

  it('should resolve computed properties', () => {
    mockCollection.computed.computedProp.mockReturnValue('computedValue')
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) }) as any
    expect(wrappedItem.computedProp).toBe('computedValue')
  })

  it('should resolve related items in the cache', () => {
    const relatedItems = [
      { id: 2, foreignKey: 1 },
      { id: 3, foreignKey: 1 },
      { id: 4, foreignKey: 2 },
    ] as any[]
    ;(mockStore.$cache.readItems as MockedFunction<typeof mockStore.$cache.readItems>).mockImplementation(({ filter }) => {
      return relatedItems.filter(filter as any)
    })
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) }) as any
    expect(wrappedItem.relatedItems.length).toBe(2)
    expect(wrappedItem.relatedItems[0].id).toBe(2)
    expect(wrappedItem.relatedItems[1].id).toBe(3)
  })

  it('should resolve related items with multiple foreign keys', () => {
    mockCollection.relations.relatedItems!.to.relatedCollection!.on = {
      'relatedCollection.foreignKey1': 'testCollection.id1',
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
    ;(mockStore.$cache.readItems as MockedFunction<typeof mockStore.$cache.readItems>).mockImplementation(({ filter }) => {
      return relatedItems.filter(filter as any)
    })
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) }) as any
    expect(wrappedItem.relatedItems.length).toBe(1)
    expect(wrappedItem.relatedItems[0].meow).toBe('meow')
  })

  it('should throw an error when trying to set a property', () => {
    const wrappedItem = wrapItem<any, any, Schema>({ store: mockStore, collection: mockCollection, item: mockItem, metadata: createMetadata(), relationCache: ref(new Map()) })
    expect(() => {
      (wrappedItem as any).newProp = 'value'
    }).toThrow('Items are read-only. Use `item.$updateForm()` to update the item.')
  })
})
