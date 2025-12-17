import type { StandardSchemaV1 } from '@rstore/shared'
import type { WrappedItemMetadata } from '../src/item'
import { describe, expect, it, vi } from 'vitest'
import { markRaw, ref } from 'vue'
import { wrapItem } from '../src/item'
import { createStore } from '../src/store'

type Schema = [
  { name: 'testCollection' },
  { name: 'relatedCollection' },
]

describe('wrapItem', () => {
  function createMetadata(): WrappedItemMetadata<any, any, any> {
    return {
      queries: new Set(),
      dirtyQueries: new Set(),
    }
  }

  it('should return a proxy with $collection property', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection' },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    const wrappedItem = wrapItem<any, any, Schema>({
      store,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.$collection).toBe('testCollection')
  })

  it('should return the key using $getKey', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection', getKey: () => 'itemKey' },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    const wrappedItem = wrapItem<any, any, Schema>({
      store,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.$getKey()).toBe('itemKey')
  })

  it('should throw an error if key is undefined in $getKey', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection', getKey: () => undefined },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    const wrappedItem = wrapItem<any, any, Schema>({
      store,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    expect(() => wrappedItem.$getKey()).toThrow('Key is undefined on item')
  })

  it('should call updateForm with correct arguments in $updateForm', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection' },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id: 1 },
      key: 1,
    })
    const wrappedItem = wrapItem<any, any, Schema>({
      store,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    const updateFormSpy = vi.spyOn(store.testCollection, 'updateForm')
    const schema = { type: 'object' } as unknown as StandardSchemaV1
    const form = await wrappedItem.$updateForm({ schema })
    expect(updateFormSpy).toHaveBeenCalledWith(
      { key: 1 },
      { defaultValues: undefined },
    )
    expect(form.$schema).toBe(markRaw(schema))
  })

  it('should call update with correct arguments in $update', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection' },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id: 1 },
      key: 1,
    })
    const wrappedItem = wrapItem<any, any, Schema>({
      store,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    const updateSpy = vi.spyOn(store.testCollection, 'update')
    wrappedItem.$update({ name: 'updatedName' })
    expect(updateSpy).toHaveBeenCalledWith(
      { name: 'updatedName' },
      { key: 1 },
    )
  })

  it('should call delete with correct arguments in $delete', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection' },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id: 1 },
      key: 1,
    })
    const wrappedItem = wrapItem<any, any, Schema>({
      store,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    const deleteSpy = vi.spyOn(store.testCollection, 'delete')
    wrappedItem.$delete()
    expect(deleteSpy).toHaveBeenCalledWith(1)
  })

  it('should resolve computed properties', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection', computed: {
          computedProp: () => 'computedValue',
        } },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    const wrappedItem = wrapItem({
      store: store as any,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.computedProp).toBe('computedValue')
  })

  it('should resolve related items in the cache', async () => {
    const relatedItems = [
      { id: 2, foreignKey: 1 },
      { id: 3, foreignKey: 1 },
      { id: 4, foreignKey: 2 },
    ] as any[]
    const store = await createStore({
      schema: [
        { name: 'testCollection', relations: {
          relatedItems: {
            many: true,
            to: {
              relatedCollection: {
                on: {
                  foreignKey: 'id',
                },
              },
            },
          },
        } },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id: 1 },
      key: 1,
    })
    store.$cache.writeItems({
      collection: store.$collections[1]!,
      items: relatedItems.map(i => ({ key: i.id, value: i })),
    })
    const wrappedItem = wrapItem({
      store: store as any,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.relatedItems.length).toBe(2)
    expect(wrappedItem.relatedItems[0].id).toBe(2)
    expect(wrappedItem.relatedItems[1].id).toBe(3)

    // Test index updates
    store.$cache.writeItem({
      collection: store.$collections[1]!,
      item: { id: 5, foreignKey: 1 },
      key: 5,
    })
    expect(wrappedItem.relatedItems.length).toBe(3)
    expect(wrappedItem.relatedItems[2].id).toBe(5)
  })

  it('should resolve related items with multiple foreign keys', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection', relations: {
          relatedItems: {
            many: true,
            to: {
              relatedCollection: {
                on: {
                  foreignKey1: 'id1',
                  foreignKey2: 'id2',
                },
              },
            },
          },
        }, getKey: (item: any) => `${item.id1}:${item.id2}` },
        { name: 'relatedCollection', getKey: (item: any) => item.meow },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id1: 1, id2: 2 },
      key: '1:2',
    })
    const relatedItems = [
      { meow: 'meow', foreignKey1: 1, foreignKey2: 2 },
      { meow: 'purr', foreignKey1: 1, foreignKey2: 3 },
    ] as any[]
    store.$cache.writeItems({
      collection: store.$collections[1]!,
      items: relatedItems.map(i => ({ key: i.meow, value: i })),
    })
    const wrappedItem = wrapItem({
      store: store as any,
      collection: store.$collections[0]!,
      item: ref({
        id1: 1,
        id2: 2,
      }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.relatedItems.length).toBe(1)
    expect(wrappedItem.relatedItems[0].meow).toBe('meow')
  })

  it('should resolve related items in the cache - none matching', async () => {
    const relatedItems = [
      { id: 2, foreignKey: 1 },
      { id: 3, foreignKey: 1 },
      { id: 4, foreignKey: 2 },
    ] as any[]
    const store = await createStore({
      schema: [
        { name: 'testCollection', relations: {
          relatedItems: {
            many: true,
            to: {
              relatedCollection: {
                on: {
                  foreignKey: 'id',
                },
              },
            },
          },
        } },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id: 42 },
      key: 42,
    })
    store.$cache.writeItems({
      collection: store.$collections[1]!,
      items: relatedItems.map(i => ({ key: i.id, value: i })),
    })
    const wrappedItem = wrapItem({
      store: store as any,
      collection: store.$collections[0]!,
      item: ref({
        id: 42,
      }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.relatedItems.length).toBe(0)

    // Test index updates
    store.$cache.writeItem({
      collection: store.$collections[1]!,
      item: { id: 5, foreignKey: 42 },
      key: 5,
    })
    expect(wrappedItem.relatedItems.length).toBe(1)
    expect(wrappedItem.relatedItems[0].id).toBe(5)
  })

  it('should not resolve related items if relation fields are nullish', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection', relations: {
          relatedItem: {
            to: {
              relatedCollection: {
                on: {
                  id: 'relatedId',
                },
              },
            },
          },
        } },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id: 0 },
      key: 0,
    })
    store.$cache.writeItem({
      collection: store.$collections[1]!,
      item: { id: 1 },
      key: 1,
    })
    const wrappedItem = wrapItem({
      store: store as any,
      collection: store.$collections[0]!,
      item: ref({
        id: 0,
      }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.relatedItem).toBeUndefined()
  })

  it('should resolve related items in the cache with actual field', async () => {
    const relatedItems = [
      { id: 2, foreignKey: 1 },
      { id: 3, foreignKey: 1 },
      { id: 4, foreignKey: 2 },
    ] as any[]
    const store = await createStore({
      schema: [
        { name: 'testCollection', relations: {
          relatedItems: {
            many: true,
            to: {
              relatedCollection: {
                on: {
                  foreignKey: 'id',
                },
              },
            },
          },
        } },
        {
          name: 'relatedCollection',
          relations: {
            parentItem: {
              to: {
                testCollection: {
                  on: {
                    id: 'foreignKey',
                  },
                },
              },
            },
          },
        },
      ],
      plugins: [],
    })
    store.$cache.writeItem({
      collection: store.$collections[0]!,
      item: { id: 1 },
      key: 1,
    })
    store.$cache.writeItems({
      collection: store.$collections[1]!,
      items: relatedItems.map(i => ({ key: i.id, value: i })),
    })
    const wrappedItem = wrapItem({
      store: store as any,
      collection: store.$collections[1]!,
      item: ref({ id: 2, foreignKey: 1 }),
      metadata: createMetadata(),
    })
    expect(wrappedItem.parentItem).toBeDefined()
    expect(wrappedItem.parentItem.id).toBe(1)
  })

  it('should throw an error when trying to set a property', async () => {
    const store = await createStore({
      schema: [
        { name: 'testCollection' },
        { name: 'relatedCollection' },
      ],
      plugins: [],
    })
    const wrappedItem = wrapItem<any, any, Schema>({
      store,
      collection: store.$collections[0]!,
      item: ref({
        id: 1,
      }),
      metadata: createMetadata(),
    })
    expect(() => {
      (wrappedItem as any).newProp = 'value'
    }).toThrow('Items are read-only. Use `item.$updateForm()` to update the item.')
  })
})
