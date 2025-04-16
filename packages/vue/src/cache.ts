import type { VueStore } from './store'
import { type Cache, type Model, type ModelDefaults, type ModelList, pickNonSpecialProps, type ResolvedModel, type ResolvedModelItem, type WrappedItem } from '@rstore/shared'
import { ref, toRaw } from 'vue'
import { wrapItem } from './item'

export interface CreateCacheOptions<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
> {
  getStore: () => VueStore<TModelList, TModelDefaults>
}

export function createCache<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
>({
  getStore,
}: CreateCacheOptions<TModelList, TModelDefaults>): Cache {
  const state = ref<Record<string, any>>({
    _markers: {},
  })

  let wrappedItems = new WeakMap<ResolvedModelItem<Model, TModelDefaults, TModelList>, WrappedItem<Model, TModelDefaults, TModelList>>()

  function getWrappedItem<TModel extends Model>(
    model: ResolvedModel<TModel, TModelDefaults, TModelList>,
    item: ResolvedModelItem<TModel, TModelDefaults, TModelList> | null | undefined,
  ): WrappedItem<TModel, TModelDefaults, TModelList> | undefined {
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
    readItems({ model, marker }) {
      if (marker && !state.value._markers?.[marker]) {
        return []
      }
      return Object.values<any>(state.value[model.name] ?? {}).map(item => getWrappedItem(model, item)).filter(Boolean) as WrappedItem<any, any, any>[]
    },
    writeItem({ model, key, item, marker, fromWriteItems }) {
      state.value[model.name] ??= {}
      const itemsForType = state.value[model.name]
      const rawData = pickNonSpecialProps(item)

      // Handle relations
      const data = {} as Record<string, any>
      for (const key in rawData) {
        if (key in model.relations) {
          const relation = model.relations[key]
          const rawItem = rawData[key]

          if (relation.many && !Array.isArray(rawItem)) {
            throw new Error(`Expected array for relation ${model.name}.${key}`)
          }
          else if (!relation.many && Array.isArray(rawItem)) {
            throw new Error(`Expected object for relation ${model.name}.${key}`)
          }

          if (Array.isArray(rawItem)) {
            for (const nestedItem of rawItem as any[]) {
              this.writeItemForRelation({
                parentModel: model,
                relationKey: key,
                relation,
                childItem: nestedItem,
              })
            }
          }
          else {
            this.writeItemForRelation({
              parentModel: model,
              relationKey: key,
              relation,
              childItem: rawItem,
            })
          }
        }
        else {
          data[key] = rawData[key]
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
    },
  } satisfies Cache & {
    _private: {
      state: typeof state
      wrappedItems: typeof wrappedItems
    }
  } as any
}
