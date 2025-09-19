import type { VueStore } from './store'
import { type Cache, type CacheLayer, type Collection, type CollectionDefaults, pickNonSpecialProps, type ResolvedCollection, type ResolvedCollectionItem, type ResolvedCollectionItemBase, type StoreSchema, type WrappedItem } from '@rstore/shared'
import { computed, ref, toRaw } from 'vue'
import { wrapItem, type WrappedItemMetadata } from './item'

export interface CreateCacheOptions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  getStore: () => VueStore<TSchema, TCollectionDefaults>
}

export function createCache<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>({
  getStore,
}: CreateCacheOptions<TSchema, TCollectionDefaults>): Cache {
  const state = ref<Record<string, any>>({
    _markers: {},
  })

  const layers = ref<CacheLayer[]>([])

  const wrappedItems = new Map<string, WrappedItem<Collection, TCollectionDefaults, TSchema>>()
  const wrappedItemsMetadata = new Map<string, WrappedItemMetadata<Collection, TCollectionDefaults, TSchema>>()
  const wrappedItemKeysPerLayer = new Map<string, Set<string>>()

  function getItemWrapKey(collection: ResolvedCollection<any, any, any>, key: string | number, layer: CacheLayer | undefined) {
    return [layer?.id, collection.name, key].filter(Boolean).join(':')
  }

  function getItemKey(collection: ResolvedCollection<any, any, any>, item: ResolvedCollectionItem<any, any, any>): string | number {
    const key = collection.getKey(item)
    if (key == null) {
      throw new Error(`Item does not have a key for collection ${collection.name}: ${item}`)
    }
    return key
  }

  function addWrappedItemKeyToLayer(layer: CacheLayer | undefined, wrapKey: string) {
    if (!layer) {
      return
    }
    let keys = wrappedItemKeysPerLayer.get(layer.id)
    if (!keys) {
      keys = new Set()
      wrappedItemKeysPerLayer.set(layer.id, keys)
    }
    keys.add(wrapKey)
  }

  function getWrappedItem<TCollection extends Collection>(
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
    item: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | null | undefined,
  ): WrappedItem<TCollection, TCollectionDefaults, TSchema> | undefined {
    if (!item) {
      return undefined
    }
    const key = getItemKey(collection, item)
    const layer = item.$layer as CacheLayer | undefined
    const wrapKey = getItemWrapKey(collection, key, layer)
    let wrappedItem = wrappedItems.get(wrapKey)
    if (!wrappedItem) {
      let metadata = wrappedItemsMetadata.get(wrapKey)
      if (!metadata) {
        metadata = {
          queries: new Set(),
          dirtyQueries: new Set(),
        }
        wrappedItemsMetadata.set(wrapKey, metadata)
      }
      wrappedItem = wrapItem({
        store: getStore(),
        collection,
        item: computed(() => layer
          ? item
          : state.value[collection.name]?.[key] ?? item),
        metadata,
      })
      wrappedItems.set(wrapKey, wrappedItem)
      addWrappedItemKeyToLayer(item.$layer, wrapKey)
    }
    return wrappedItem
  }

  function mark(marker: string) {
    if (!state.value._markers) {
      state.value._markers = {}
    }
    state.value._markers[marker] = true
  }

  function deleteItem(collection: ResolvedCollection<any, any, any>, key: string | number) {
    const item = state.value[collection.name]?.[key]
    if (item) {
      delete state.value[collection.name]?.[key]
      const wrapKey = getItemWrapKey(collection, key, undefined)
      wrappedItems.delete(wrapKey)
      wrappedItemsMetadata.delete(wrapKey)
      const store = getStore()
      store.$hooks.callHookSync('afterCacheWrite', {
        store,
        meta: {},
        collection,
        key,
        operation: 'delete',
      })
    }
  }

  function garbageCollectItem<TCollection extends Collection>(collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>, item: WrappedItem<TCollection, TCollectionDefaults, TSchema>) {
    if (item.$meta.queries.size === 0) {
      const key = getItemKey(collection, item)
      deleteItem(collection, key)
      const store = getStore()
      store.$hooks.callHookSync('itemGarbageCollect', {
        store,
        collection,
        item,
        key,
      })
    }
  }

  function getStateForCollection(collectionName: string) {
    let copied = false
    let result = state.value[collectionName] ?? {}

    // Add & modify from layers
    for (const layer of layers.value) {
      if (!layer.skip && layer.state[collectionName]) {
        // Lazy copy the state if needed
        if (!copied) {
          result = Object.assign({}, result)
          copied = true
        }

        const layerState: Record<string | number, any> = {}
        for (const [key, value] of Object.entries(layer.state[collectionName])) {
          const data = {
            ...result[key],
            ...value,
            $layer: layer,
          }
          layerState[key] = data
        }
        Object.assign(result, layerState)
      }
    }

    // Delete from layers
    for (const layer of layers.value) {
      if (!layer.skip && layer.deletedItems[collectionName]) {
        // Lazy copy the state if needed
        if (!copied) {
          result = Object.assign({}, result)
          copied = true
        }

        for (const key of layer.deletedItems[collectionName]) {
          delete result[key]
        }
      }
    }

    return result
  }

  function removeLayer(layerId: string) {
    const index = layers.value.findIndex(l => l.id === layerId)
    if (index !== -1) {
      const layer = layers.value[index]!
      const keys = wrappedItemKeysPerLayer.get(layer.id)
      if (keys) {
        for (const key of keys) {
          wrappedItems.delete(key)
          wrappedItemsMetadata.delete(key)
        }
        wrappedItemKeysPerLayer.delete(layer.id)
      }
      layers.value.splice(index, 1)
      const store = getStore()
      store.$hooks.callHookSync('cacheLayerRemove', {
        store,
        layer,
      })
    }
  }

  return {
    wrapItem({ collection, item }) {
      return getWrappedItem(collection, item)!
    },
    readItem({ collection, key }) {
      return getWrappedItem(collection, getStateForCollection(collection.name)[key])
    },
    readItems({ collection, marker, filter, limit }) {
      if (marker && !state.value._markers?.[marker]) {
        return []
      }
      const data: Record<string | number, ResolvedCollectionItemBase<any, any, any>> = getStateForCollection(collection.name)
      const result: Array<WrappedItem<any, any, any>> = []
      let count = 0
      for (const key in data) {
        const item = data[key]
        if (item) {
          if (filter && !filter(item)) {
            continue
          }
          const wrappedItem = getWrappedItem(collection, item)
          if (wrappedItem) {
            result.push(wrappedItem)
            count++
            if (limit != null && count >= limit) {
              break
            }
          }
        }
      }
      return result
    },
    writeItem({ collection, key, item, marker, fromWriteItems }) {
      state.value[collection.name] ??= {}
      const itemsForType = state.value[collection.name]
      const isFrozen = Object.isFrozen(item)
      if (isFrozen) {
        itemsForType[key] = item
      }
      else {
        const rawData = pickNonSpecialProps(item, true)

        // Handle relations
        const data = {} as Record<string, any>
        for (const field in rawData) {
          if (field in collection.relations) {
            const relation = collection.relations[field]
            const rawItem = rawData[field]

            // TODO: figure out deletions
            if (!rawItem || !relation) {
              continue
            }

            if (relation.many && !Array.isArray(rawItem)) {
              throw new Error(`Expected array for relation ${collection.name}.${field}`)
            }
            else if (!relation.many && Array.isArray(rawItem)) {
              throw new Error(`Expected object for relation ${collection.name}.${field}`)
            }

            if (Array.isArray(rawItem)) {
              for (const nestedItem of rawItem as any[]) {
                this.writeItemForRelation({
                  parentCollection: collection,
                  relationKey: field,
                  relation,
                  childItem: nestedItem,
                })
              }
            }
            else if (rawItem) {
              this.writeItemForRelation({
                parentCollection: collection,
                relationKey: field,
                relation,
                childItem: rawItem,
              })
            }
            else {
            // TODO: figure out deletions
            // // If to-one relation is null, we delete the existing item
            // const existingItem = this.readItem({ collection, key })
            // if (existingItem) {
            //   const childItem: WrappedItemBase<Collection, CollectionDefaults, StoreSchema> = existingItem[field]
            //   const nestedItemCollection = getStore().$getCollection(childItem, [childItem.$collection])
            //   const nestedKey = nestedItemCollection?.getKey(childItem)
            //   if (nestedItemCollection && nestedKey) {
            //     this.deleteItem({ collection: nestedItemCollection, key: nestedKey })
            //   }
            // }
            }
          }
          else {
            data[field] = rawData[field]
          }
        }

        const existing = itemsForType[key]
        if (!existing) {
          itemsForType[key] = data
        }
        else if (Object.isFrozen(existing)) {
          itemsForType[key] = {
            ...existing,
            ...data,
          }
        }
        else {
          Object.assign(existing, data)
        }
      }
      if (marker) {
        mark(marker)
      }

      if (!fromWriteItems) {
        const store = getStore()
        store.$hooks.callHookSync('afterCacheWrite', {
          store,
          meta: {},
          collection,
          key,
          result: [item],
          marker,
          operation: 'write',
        })
      }
    },
    writeItems({ collection, items, marker }) {
      for (const { key, value: item } of items) {
        this.writeItem({ collection, key, item, fromWriteItems: true })
      }
      mark(marker)
      const store = getStore()
      store.$hooks.callHookSync('afterCacheWrite', {
        store,
        meta: {},
        collection,
        result: items,
        marker,
        operation: 'write',
      })
    },
    writeItemForRelation({ parentCollection, relationKey, relation, childItem }) {
      const store = getStore()
      const possibleCollections = Object.keys(relation.to)
      const nestedItemCollection = store.$getCollection(childItem, possibleCollections)
      if (!nestedItemCollection) {
        throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
      }
      const nestedKey = nestedItemCollection.getKey(childItem)
      if (!nestedKey) {
        throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
      }

      this.writeItem({
        collection: nestedItemCollection,
        key: nestedKey,
        item: childItem,
      })
    },
    deleteItem({ collection, key }) {
      deleteItem(collection, key)
    },
    getModuleState(name, key, initState) {
      const cacheKey = `$${name}:${key}`
      state.value[cacheKey] ??= initState
      return state.value[cacheKey]
    },
    getState() {
      return toRaw(state.value)
    },
    setState(value) {
      state.value = value
      wrappedItems.clear()
      wrappedItemsMetadata.clear()

      const store = getStore()
      store.$hooks.callHookSync('afterCacheReset', {
        store,
        meta: {},
      })
    },
    clear() {
      state.value = {}
      wrappedItems.clear()
      wrappedItemsMetadata.clear()

      const store = getStore()
      store.$hooks.callHookSync('afterCacheReset', {
        store,
        meta: {},
      })
    },
    clearCollection({ collection }) {
      const itemsForType = state.value[collection.name]
      if (itemsForType) {
        for (const key in itemsForType) {
          this.deleteItem({ collection, key })
        }
      }
    },
    garbageCollectItem({ collection, item }) {
      garbageCollectItem(collection, item)
    },
    garbageCollect() {
      for (const collectionName in state.value) {
        if (collectionName === '_markers' || collectionName.startsWith('$')) {
          continue
        }
        const collection = getStore().$collections.find(m => m.name === collectionName)
        if (!collection) {
          continue
        }
        const itemsForType = state.value[collectionName]
        for (const key in itemsForType) {
          const wrappedItem = this.wrapItem({ collection, item: itemsForType[key] })
          garbageCollectItem(collection, wrappedItem)
        }
      }
    },
    addLayer(layer) {
      removeLayer(layer.id)
      layers.value.push(layer)
      const store = getStore()
      store.$hooks.callHookSync('cacheLayerAdd', {
        store,
        layer,
      })
    },
    getLayer(layerId) {
      return layers.value.find(l => l.id === layerId)
    },
    removeLayer,
    _private: {
      state,
      wrappedItems,
      wrappedItemsMetadata,
      getWrappedItem,
      layers,
    },
  } satisfies Cache & {
    _private: {
      state: typeof state
      wrappedItems: typeof wrappedItems
      wrappedItemsMetadata: typeof wrappedItemsMetadata
      getWrappedItem: typeof getWrappedItem
      layers: typeof layers
    }
  } as any
}
