import type { VueStore } from './store'
import { type Cache, type Model, type ModelDefaults, pickNonSpecialProps, type ResolvedModel, type ResolvedModelItem, type ResolvedModelItemBase, type StoreSchema, type WrappedItem } from '@rstore/shared'
import { ref, toRaw } from 'vue'
import { wrapItem } from './item'

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

  let wrappedItems = new WeakMap<ResolvedModelItem<Model, TModelDefaults, TSchema>, WrappedItem<Model, TModelDefaults, TSchema>>()

  function getWrappedItem<TModel extends Model>(
    model: ResolvedModel<TModel, TModelDefaults, TSchema>,
    item: ResolvedModelItem<TModel, TModelDefaults, TSchema> | null | undefined,
  ): WrappedItem<TModel, TModelDefaults, TSchema> | undefined {
    if (!item) {
      return undefined
    }
    let wrappedItem = wrappedItems.get(item)
    if (!wrappedItem) {
      wrappedItem = wrapItem({
        store: getStore(),
        model,
        item,
      })
      wrappedItems.set(item, wrappedItem)
    }
    return wrappedItem
  }

  function mark(marker: string) {
    if (!state.value._markers) {
      state.value._markers = {}
    }
    state.value._markers[marker] = true
  }

  return {
    readItem({ model, key }) {
      return getWrappedItem(model, state.value[model.name]?.[key])
    },
    readItems({ model, marker, filter }) {
      if (marker && !state.value._markers?.[marker]) {
        return []
      }
      const data: Array<ResolvedModelItemBase<any, any, any>> = Object.values(state.value[model.name] ?? {})
      const result: Array<WrappedItem<any, any, any>> = []
      for (const item of data) {
        if (item) {
          if (filter && !filter(item)) {
            continue
          }
          const wrappedItem = getWrappedItem(model, item)
          if (wrappedItem) {
            result.push(wrappedItem)
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
      const item = state.value[model.name]?.[key]
      if (item) {
        delete state.value[model.name]?.[key]
        wrappedItems.delete(item)
        const store = getStore()
        store.$hooks.callHookSync('afterCacheWrite', {
          store,
          meta: {},
          model,
          key,
          operation: 'delete',
        })
      }
    },
    getModuleState(name, initState) {
      const cacheKey = `$${name}`
      state.value[cacheKey] ??= initState
      return state.value[cacheKey]
    },
    getState() {
      return toRaw(state.value)
    },
    setState(value) {
      state.value = value
      wrappedItems = new WeakMap()

      const store = getStore()
      store.$hooks.callHookSync('afterCacheReset', {
        store,
        meta: {},
      })
    },
    clear() {
      state.value = {}
      wrappedItems = new WeakMap()

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
    _private: {
      state,
      wrappedItems,
      getWrappedItem,
    },
  } satisfies Cache & {
    _private: {
      state: typeof state
      wrappedItems: typeof wrappedItems
      getWrappedItem: typeof getWrappedItem
    }
  } as any
}
