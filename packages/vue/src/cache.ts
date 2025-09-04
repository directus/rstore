import type { VueStore } from './store'
import { type Cache, type CacheLayer, type Model, type ModelDefaults, pickNonSpecialProps, type ResolvedModel, type ResolvedModelItem, type ResolvedModelItemBase, type StoreSchema, type WrappedItem } from '@rstore/shared'
import { computed, ref, toRaw } from 'vue'
import { wrapItem, type WrappedItemMetadata } from './item'

export interface CreateCacheOptions<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults,
> {
  getStore: () => VueStore<TSchema, TModelDefaults>
}

export function createCache<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults,
>({
  getStore,
}: CreateCacheOptions<TSchema, TModelDefaults>): Cache {
  const state = ref<Record<string, any>>({
    _markers: {},
  })

  const layers = ref<CacheLayer[]>([])

  const wrappedItems = new Map<string, WrappedItem<Model, TModelDefaults, TSchema>>()
  const wrappedItemsMetadata = new Map<string, WrappedItemMetadata<Model, TModelDefaults, TSchema>>()
  const wrappedItemKeysPerLayer = new Map<string, Set<string>>()

  function getItemWrapKey(model: ResolvedModel<any, any, any>, key: string | number, layer: CacheLayer | undefined) {
    return [layer?.id, model.name, key].filter(Boolean).join(':')
  }

  function getItemKey(model: ResolvedModel<any, any, any>, item: ResolvedModelItem<any, any, any>): string | number {
    const key = model.getKey(item)
    if (key == null) {
      throw new Error(`Item does not have a key for model ${model.name}: ${item}`)
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

  function getWrappedItem<TModel extends Model>(
    model: ResolvedModel<TModel, TModelDefaults, TSchema>,
    item: ResolvedModelItem<TModel, TModelDefaults, TSchema> | null | undefined,
  ): WrappedItem<TModel, TModelDefaults, TSchema> | undefined {
    if (!item) {
      return undefined
    }
    const key = getItemKey(model, item)
    const layer = item.$layer as CacheLayer | undefined
    const wrapKey = getItemWrapKey(model, key, layer)
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
        model,
        item: computed(() => layer
          ? item
          : state.value[model.name]?.[key] ?? item),
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

  function deleteItem(model: ResolvedModel<any, any, any>, key: string | number) {
    const item = state.value[model.name]?.[key]
    if (item) {
      delete state.value[model.name]?.[key]
      const wrapKey = getItemWrapKey(model, key, undefined)
      wrappedItems.delete(wrapKey)
      wrappedItemsMetadata.delete(wrapKey)
      const store = getStore()
      store.$hooks.callHookSync('afterCacheWrite', {
        store,
        meta: {},
        model,
        key,
        operation: 'delete',
      })
    }
  }

  function garbageCollectItem<TModel extends Model>(model: ResolvedModel<TModel, TModelDefaults, TSchema>, item: WrappedItem<TModel, TModelDefaults, TSchema>) {
    if (item.$meta.queries.size === 0) {
      const key = getItemKey(model, item)
      deleteItem(model, key)
      const store = getStore()
      store.$hooks.callHookSync('itemGarbageCollect', {
        store,
        model,
        item,
        key,
      })
    }
  }

  function getStateForModel(modelName: string) {
    const result = Object.assign({}, state.value[modelName] ?? {})

    // Add & modify from layers
    for (const layer of layers.value) {
      if (!layer.skip && layer.state[modelName]) {
        const layerState: Record<string | number, any> = {}
        for (const [key, value] of Object.entries(layer.state[modelName])) {
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
      if (!layer.skip && layer.deletedItems[modelName]) {
        for (const key of layer.deletedItems[modelName]) {
          delete result[key]
        }
      }
    }

    return result
  }

  return {
    wrapItem({ model, item }) {
      return getWrappedItem(model, item)!
    },
    readItem({ model, key }) {
      return getWrappedItem(model, getStateForModel(model.name)[key])
    },
    readItems({ model, marker, filter, limit }) {
      if (marker && !state.value._markers?.[marker]) {
        return []
      }
      const data: Array<ResolvedModelItemBase<any, any, any>> = Object.values(getStateForModel(model.name))
      const result: Array<WrappedItem<any, any, any>> = []
      let count = 0
      for (const item of data) {
        if (item) {
          if (filter && !filter(item)) {
            continue
          }
          const wrappedItem = getWrappedItem(model, item)
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
    writeItem({ model, key, item, marker, fromWriteItems }) {
      state.value[model.name] ??= {}
      const itemsForType = state.value[model.name]
      const rawData = pickNonSpecialProps(item)

      // Handle relations
      const data = {} as Record<string, any>
      for (const field in rawData) {
        if (field in model.relations) {
          const relation = model.relations[field]
          const rawItem = rawData[field]

          // TODO: figure out deletions
          if (!rawItem) {
            continue
          }

          if (relation.many && !Array.isArray(rawItem)) {
            throw new Error(`Expected array for relation ${model.name}.${field}`)
          }
          else if (!relation.many && Array.isArray(rawItem)) {
            throw new Error(`Expected object for relation ${model.name}.${field}`)
          }

          if (Array.isArray(rawItem)) {
            for (const nestedItem of rawItem as any[]) {
              this.writeItemForRelation({
                parentModel: model,
                relationKey: field,
                relation,
                childItem: nestedItem,
              })
            }
          }
          else if (rawItem) {
            this.writeItemForRelation({
              parentModel: model,
              relationKey: field,
              relation,
              childItem: rawItem,
            })
          }
          else {
            // TODO: figure out deletions
            // // If to-one relation is null, we delete the existing item
            // const existingItem = this.readItem({ model, key })
            // if (existingItem) {
            //   const childItem: WrappedItemBase<Model, ModelDefaults, StoreSchema> = existingItem[field]
            //   const nestedItemModel = getStore().$getModel(childItem, [childItem.$model])
            //   const nestedKey = nestedItemModel?.getKey(childItem)
            //   if (nestedItemModel && nestedKey) {
            //     this.deleteItem({ model: nestedItemModel, key: nestedKey })
            //   }
            // }
          }
        }
        else {
          data[field] = rawData[field]
        }
      }

      if (!itemsForType[key]) {
        itemsForType[key] = data
      }
      else {
        Object.assign(itemsForType[key], data)
      }
      if (marker) {
        mark(marker)
      }

      if (!fromWriteItems) {
        const store = getStore()
        store.$hooks.callHookSync('afterCacheWrite', {
          store,
          meta: {},
          model,
          key,
          result: [item],
          marker,
          operation: 'write',
        })
      }
    },
    writeItems({ model, items, marker }) {
      for (const { key, value: item } of items) {
        this.writeItem({ model, key, item, fromWriteItems: true })
      }
      mark(marker)
      const store = getStore()
      store.$hooks.callHookSync('afterCacheWrite', {
        store,
        meta: {},
        model,
        result: items,
        marker,
        operation: 'write',
      })
    },
    writeItemForRelation({ parentModel, relationKey, relation, childItem }) {
      const store = getStore()
      const possibleModels = Object.keys(relation.to)
      const nestedItemModel = store.$getModel(childItem, possibleModels)
      if (!nestedItemModel) {
        throw new Error(`Could not determine type for relation ${parentModel.name}.${String(relationKey)}`)
      }
      const nestedKey = nestedItemModel.getKey(childItem)
      if (!nestedKey) {
        throw new Error(`Could not determine key for relation ${parentModel.name}.${String(relationKey)}`)
      }

      this.writeItem({
        model: nestedItemModel,
        key: nestedKey,
        item: childItem,
      })
    },
    deleteItem({ model, key }) {
      deleteItem(model, key)
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
    clearModel({ model }) {
      const itemsForType = state.value[model.name]
      if (itemsForType) {
        for (const key in itemsForType) {
          this.deleteItem({ model, key })
        }
      }
    },
    garbageCollectItem({ model, item }) {
      garbageCollectItem(model, item)
    },
    garbageCollect() {
      for (const modelName in state.value) {
        if (modelName === '_markers' || modelName.startsWith('$')) {
          continue
        }
        const model = getStore().$models.find(m => m.name === modelName)
        if (!model) {
          continue
        }
        const itemsForType = state.value[modelName]
        for (const key in itemsForType) {
          const wrappedItem = this.wrapItem({ model, item: itemsForType[key] })
          garbageCollectItem(model, wrappedItem)
        }
      }
    },
    addLayer(layer) {
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
    removeLayer(layerId) {
      const index = layers.value.findIndex(l => l.id === layerId)
      if (index !== -1) {
        const layer = layers.value[index]
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
    },
    _private: {
      state,
      wrappedItems,
      wrappedItemsMetadata,
      getWrappedItem,
    },
  } satisfies Cache & {
    _private: {
      state: typeof state
      wrappedItems: typeof wrappedItems
      wrappedItemsMetadata: typeof wrappedItemsMetadata
      getWrappedItem: typeof getWrappedItem
    }
  } as any
}
