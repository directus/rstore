import type { Cache, CacheLayer, Collection, CollectionDefaults, CustomCacheState, CustomHookMeta, ResolvedCollection, ResolvedCollectionItem, ResolvedCollectionItemBase, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { WrappedItemMetadata } from './item'
import type { VueStore } from './store'
import { isKeyDefined } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { computed, markRaw, ref, shallowRef, toValue } from 'vue'
import { wrapItem } from './item'

declare module '@rstore/shared' {
  export interface CustomCacheState {
    markers: Record<string, boolean>
    collections: Record<string, Record<string | number, any>>
    modules: Record<string, any>
    queryMeta: Record<string, CustomHookMeta>
  }
}

interface InternalCacheState {
  markers: Record<string, boolean>
  collections: Record<string, Ref<Record<string | number, any>>>
  /**
   * collection name -> relation fields (ex: `authorId` or `field1:field2`) -> relation value (values.join(':')) -> item keys
   */
  collectionIndexes: Map<string, Map<string, Map<any, Ref<Set<string | number>>>>>
  modules: Record<string, Ref<any>>
  queryMeta: Record<string, CustomHookMeta>
  pageRefs: Map<string, { type: 'ref', key: string | number } | { type: 'refs', keys: Array<string | number> }>
}

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
  const state: InternalCacheState = {
    markers: {},
    collections: {},
    collectionIndexes: new Map(),
    modules: {},
    queryMeta: {},
    pageRefs: new Map(),
  }

  const layers: Record<string, Ref<CacheLayer[]>> = {}
  const layerIdToCollectionName: Record<string, string> = {}

  const wrappedItems = new Map<string, WrappedItem<Collection, TCollectionDefaults, TSchema>>()
  const wrappedItemsMetadata = new Map<string, WrappedItemMetadata<Collection, TCollectionDefaults, TSchema>>()
  const wrappedItemKeysPerLayer = new Map<string, Set<string>>()

  const collectionStateCache = new Map<string, Record<string | number, any>>()
  const collectionStateCacheReactivityMarker = new Map<string, Ref<number>>()

  function ensureCollectionStateCacheReactivityMarker(collectionName: string) {
    let marker = collectionStateCacheReactivityMarker.get(collectionName)
    if (!marker) {
      marker = ref(0)
      collectionStateCacheReactivityMarker.set(collectionName, marker)
    }
    return marker
  }

  function invalidateCollectionStateCache(collectionName: string) {
    collectionStateCache.delete(collectionName)
    ensureCollectionStateCacheReactivityMarker(collectionName).value++
  }

  function getItemWrapKey(collection: ResolvedCollection<any, any, any>, key: string | number, layer: CacheLayer | undefined) {
    return [layer?.id, collection.name, key].filter(Boolean).join(':')
  }

  function getItemKey(collection: ResolvedCollection<any, any, any>, item: ResolvedCollectionItem<any, any, any>): string | number {
    const key = collection.getKey(item)
    if (!isKeyDefined(key)) {
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

  function ensureCollectionRef(collectionName: string) {
    if (!state.collections[collectionName]) {
      state.collections[collectionName] = ref({})
    }
    return state.collections[collectionName]
  }

  function getWrappedItem<TCollection extends Collection>(
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
    item: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | null | undefined,
    noCache = false,
  ): WrappedItem<TCollection, TCollectionDefaults, TSchema> | undefined {
    if (!item) {
      return undefined
    }

    if (noCache) {
      return wrapItem({
        store: getStore(),
        collection,
        item: shallowRef(item),
        metadata: {
          queries: new Set(),
          dirtyQueries: new Set(),
        },
      })
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
          : ensureCollectionRef(collection.name).value[key] ?? item),
        metadata,
      })
      wrappedItems.set(wrapKey, wrappedItem)
      addWrappedItemKeyToLayer(item.$layer, wrapKey)
    }
    return wrappedItem
  }

  function mark(marker: string) {
    state.markers[marker] = true
  }

  function getCollectionIndex(collectionName: string, indexKey: string) {
    let collectionIndex = state.collectionIndexes.get(collectionName)
    if (!collectionIndex) {
      collectionIndex = new Map()
      state.collectionIndexes.set(collectionName, collectionIndex)
    }
    let index = collectionIndex.get(indexKey)
    if (!index) {
      index = new Map()
      collectionIndex.set(indexKey, index)
    }
    return index
  }

  function deleteItem(collection: ResolvedCollection<any, any, any>, key: string | number) {
    const collectionState = ensureCollectionRef(collection.name).value
    const item = collectionState[key]
    if (item) {
      // Update indexes
      for (const [indexKey, indexFields] of collection.indexes) {
        const index = getCollectionIndex(collection.name, indexKey)
        // Remove previous index entry
        const previousValue = indexFields.map(f => item[f]).join(':')
        const existingKeys = index.get(previousValue)
        if (existingKeys) {
          existingKeys.value.delete(key)
        }
      }

      invalidateCollectionStateCache(collection.name)
      delete collectionState[key]
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
    // eslint-disable-next-line ts/no-unused-expressions
    ensureCollectionStateCacheReactivityMarker(collectionName).value // Track reactivity

    const cached = collectionStateCache.get(collectionName)
    if (cached) {
      return cached
    }

    let copied = false
    let result = ensureCollectionRef(collectionName).value

    // Add & modify from layers
    const collectionLayersRef = layers[collectionName]
    if (collectionLayersRef) {
      const collectionLayers = collectionLayersRef.value
      for (const layer of collectionLayers) {
        if (!layer.skip) {
          // Lazy copy the state if needed
          if (!copied) {
            result = Object.assign({}, result)
            copied = true
          }

          const layerState: Record<string | number, any> = {}
          for (const [key, value] of Object.entries(layer.state)) {
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
      for (const layer of collectionLayers) {
        if (!layer.skip && layer.deletedItems) {
          // Lazy copy the state if needed
          if (!copied) {
            result = Object.assign({}, result)
            copied = true
          }

          for (const key of layer.deletedItems) {
            delete result[key]
          }
        }
      }
    }

    collectionStateCache.set(collectionName, result)

    return result
  }

  function ensureLayersForCollection(collectionName: string) {
    return layers[collectionName] ??= shallowRef([])
  }

  function removeLayer(layerId: string) {
    const collectionName = layerIdToCollectionName[layerId]
    if (!collectionName) {
      return
    }
    const collectionLayersRef = layers[collectionName]
    if (!collectionLayersRef) {
      return
    }
    const collectionLayers = collectionLayersRef.value
    const index = collectionLayers.findIndex(l => l.id === layerId)
    if (index !== -1) {
      const layer = collectionLayers[index]!
      invalidateCollectionStateCache(layer.collectionName)
      const keys = wrappedItemKeysPerLayer.get(layer.id)
      if (keys) {
        for (const key of keys) {
          wrappedItems.delete(key)
          wrappedItemsMetadata.delete(key)
        }
        wrappedItemKeysPerLayer.delete(layer.id)
      }
      collectionLayersRef.value = collectionLayers.filter(l => l.id !== layerId)
      delete layerIdToCollectionName[layerId]
      const store = getStore()
      store.$hooks.callHookSync('cacheLayerRemove', {
        store,
        layer,
      })
    }
  }

  return {
    wrapItem({ collection, item, noCache }) {
      return getWrappedItem(collection, item, noCache)!
    },
    readItem({ collection, key }) {
      return getWrappedItem(collection, getStateForCollection(collection.name)[key])
    },
    readItems({ collection, marker, filter, keys, limit, indexKey, indexValue }) {
      if (marker && !state.markers[marker]) {
        return []
      }
      const data: Record<string | number, ResolvedCollectionItemBase<any, any, any>> = getStateForCollection(collection.name)
      const result: Array<WrappedItem<any, any, any>> = []
      let count = 0

      // Index
      if (keys == null && indexKey != null) {
        const index = getCollectionIndex(collection.name, indexKey)
        const itemKeys = index.get(indexValue)
        if (itemKeys) {
          keys = Array.from(itemKeys.value)
        }
        else {
          keys = []
        }
      }

      const keysToRead = keys ?? Object.keys(data)
      for (const key of keysToRead) {
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
    writeItem({ collection, key, item, marker, fromWriteItems, meta }) {
      invalidateCollectionStateCache(collection.name)

      const collectionState = ensureCollectionRef(collection.name).value
      const isFrozen = Object.isFrozen(item)
      if (isFrozen) {
        collectionState[key] = item
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
                  meta,
                })
              }
            }
            else if (rawItem) {
              this.writeItemForRelation({
                parentCollection: collection,
                relationKey: field,
                relation,
                childItem: rawItem,
                meta,
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

        const existing = collectionState[key]

        // Update indexes
        for (const [indexKey, indexFields] of collection.indexes) {
          // Check if updated fields are part of the index
          if (indexFields.some(f => f in data && (!existing || data[f] !== existing[f]))) {
            const index = getCollectionIndex(collection.name, indexKey)
            if (existing) {
              // Remove previous index entry
              const values = indexFields.map(f => existing?.[f])
              if (values.every(v => v != null)) {
                const previousValue = values.join(':')
                const existingKeys = index.get(previousValue)
                if (existingKeys) {
                  existingKeys.value.delete(key)
                }
              }
            }
            const newValues = indexFields.map(f => data[f] ?? existing?.[f])
            if (newValues.every(v => v != null)) {
              const newValue = newValues.join(':')
              let existingKeys = index.get(newValue)
              if (!existingKeys) {
                existingKeys = ref(new Set())
                index.set(newValue, existingKeys)
              }
              existingKeys.value.add(key)
            }
          }
        }

        if (!existing) {
          // Disable deep reactivity tracking inside the `data` object
          collectionState[key] = shallowRef(markRaw(data))
        }
        else {
          collectionState[key] = markRaw({
            ...existing,
            ...data,
          })
        }
      }
      if (marker) {
        mark(marker)
      }

      if (meta?.$queryTracking) {
        meta.$queryTracking.items[collection.name] ??= new Set()
        meta.$queryTracking.items[collection.name]!.add(key)
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
    writeItems({ collection, items, marker, meta }) {
      for (const { key, value: item } of items) {
        this.writeItem({ collection, key, item, meta, fromWriteItems: true })
      }
      if (marker) {
        mark(marker)
      }
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
    writeItemForRelation({ parentCollection, relationKey, relation, childItem, meta }) {
      const store = getStore()
      const possibleCollections = Object.keys(relation.to)
      const nestedItemCollection = store.$getCollection(childItem, possibleCollections)
      if (!nestedItemCollection) {
        throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
      }
      const nestedKey = nestedItemCollection.getKey(childItem)
      if (!isKeyDefined(nestedKey)) {
        throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
      }

      this.writeItem({
        collection: nestedItemCollection,
        key: nestedKey,
        item: childItem,
        meta,
      })
    },
    deleteItem({ collection, key }) {
      deleteItem(collection, key)
    },
    getModuleState(name, key, initState) {
      const cacheKey = `${name}:${key}`
      if (!state.modules[cacheKey]) {
        state.modules[cacheKey] = ref(initState)
      }
      return state.modules[cacheKey].value
    },
    getState() {
      const result: CustomCacheState = {
        collections: {},
        markers: toValue(state.markers),
        modules: {},
        queryMeta: state.queryMeta,
      }

      for (const collectionName in state.collections) {
        const targetState: Record<string | number, any> = result.collections[collectionName] = {}
        const itemsForType = state.collections[collectionName]!.value
        for (const key in itemsForType) {
          const item = itemsForType[key]
          if (item) {
            targetState[key] = toValue(item)
          }
        }
      }

      for (const moduleKey in state.modules) {
        result.modules[moduleKey] = toValue(state.modules[moduleKey]!)
      }

      return result
    },
    setState(value) {
      // Process incoming state

      // Markers
      state.markers = value.markers || {}

      // Collections

      const newCollectionsState: Record<string, Ref<Record<string | number, any>>> = {}
      for (const collectionName in value.collections) {
        const incomingCollectionState = value.collections[collectionName as keyof typeof value.collections] as Record<string | number, any>
        const collectionState = newCollectionsState[collectionName] = ref<Record<string | number, any>>({})
        for (const key in incomingCollectionState) {
          const item = incomingCollectionState[key]
          if (item) {
            collectionState.value[key] = Object.isFrozen(item) ? item : shallowRef(item)
          }
        }
      }
      state.collections = newCollectionsState

      // Modules

      const newModulesState: Record<string, Ref<any>> = {}
      for (const moduleKey in value.modules) {
        newModulesState[moduleKey] = ref(value.modules[moduleKey])
      }
      state.modules = newModulesState

      wrappedItems.clear()
      wrappedItemsMetadata.clear()
      collectionStateCache.clear()

      const store = getStore()
      store.$hooks.callHookSync('afterCacheReset', {
        store,
        meta: {},
      })

      // Query Meta
      state.queryMeta = value.queryMeta || {}
    },
    clear() {
      state.markers = {}
      for (const collectionName in state.collections) {
        state.collections[collectionName]!.value = {}
      }
      for (const moduleKey in state.modules) {
        state.modules[moduleKey]!.value = {}
      }
      wrappedItems.clear()
      wrappedItemsMetadata.clear()
      collectionStateCache.clear()

      const store = getStore()
      store.$hooks.callHookSync('afterCacheReset', {
        store,
        meta: {},
      })
    },
    clearCollection({ collection }) {
      invalidateCollectionStateCache(collection.name)
      const itemsForType = state.collections[collection.name]
      if (itemsForType) {
        for (const key in itemsForType.value) {
          this.deleteItem({ collection, key })
        }
      }
    },
    garbageCollectItem({ collection, item }) {
      garbageCollectItem(collection, item)
    },
    garbageCollect() {
      for (const collectionName in state.collections) {
        const collection = getStore().$collections.find(m => m.name === collectionName)
        if (!collection) {
          continue
        }
        const itemsForType = state.collections[collectionName]?.value
        if (itemsForType) {
          for (const key in itemsForType) {
            const wrappedItem = this.wrapItem({ collection, item: itemsForType[key] })
            garbageCollectItem(collection, wrappedItem)
          }
        }
      }
    },
    addLayer(layer) {
      invalidateCollectionStateCache(layer.collectionName)
      removeLayer(layer.id)
      const collectionLayersRef = ensureLayersForCollection(layer.collectionName)
      collectionLayersRef.value = [...collectionLayersRef.value, layer]
      layerIdToCollectionName[layer.id] = layer.collectionName
      const store = getStore()
      store.$hooks.callHookSync('cacheLayerAdd', {
        store,
        layer,
      })
    },
    getLayer(layerId) {
      const collectionName = layerIdToCollectionName[layerId]
      if (!collectionName) {
        return undefined
      }
      const collectionLayers = ensureLayersForCollection(collectionName)
      return collectionLayers.value.find(l => l.id === layerId)
    },
    removeLayer,
    _private: {
      state,
      wrappedItems,
      wrappedItemsMetadata,
      getWrappedItem,
      layers,
      ensureLayersForCollection,
    },
  } satisfies Cache & VueCachePrivate as any
}

export interface VueCachePrivate {
  _private: {
    state: InternalCacheState
    wrappedItems: Map<string, WrappedItem<Collection, CollectionDefaults, StoreSchema>>
    wrappedItemsMetadata: Map<string, WrappedItemMetadata<Collection, CollectionDefaults, StoreSchema>>
    getWrappedItem: <TCollection extends Collection>(
      collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
      item: ResolvedCollectionItem<TCollection, CollectionDefaults, StoreSchema> | null | undefined,
      noCache?: boolean,
    ) => WrappedItem<TCollection, CollectionDefaults, StoreSchema> | undefined
    layers: Record<string, Ref<CacheLayer[]>>
    ensureLayersForCollection: (collectionName: string) => Ref<CacheLayer[]>
  }
}
