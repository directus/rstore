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

  const wrappedItems = new Map<string, WrappedItem<any, any, any>>()

  function getWrappedItemCacheKey<TModel extends Model>(
    model: ResolvedModel<TModel, TModelDefaults, TModelList>,
    key: string,
  ) {
    return `${model.name}:${key}`
  }

  function getWrappedItem<TModel extends Model>(
    model: ResolvedModel<TModel, TModelDefaults, TModelList>,
    item: ResolvedModelItem<TModel, TModelDefaults, TModelList> | null | undefined,
  ): WrappedItem<TModel, TModelDefaults, TModelList> | undefined {
    if (!item) {
      return undefined
    }
    const key = model.getKey(item)
    if (!key) {
      throw new Error('Key is required on item to get wrapped')
    }
    const cacheKey = getWrappedItemCacheKey(model, key)
    let wrappedItem = wrappedItems.get(cacheKey)
    if (!wrappedItem) {
      wrappedItem = wrapItem({
        store: getStore(),
        model,
        item,
      })
      wrappedItems.set(cacheKey, wrappedItem)
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
                model,
                relationKey: key,
                relation,
                item: nestedItem,
              })
            }
          }
          else {
            this.writeItemForRelation({
              model,
              relationKey: key,
              relation,
              item: rawItem,
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
        store.hooks.callHookSync('afterCacheWrite', {
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
      store.hooks.callHookSync('afterCacheWrite', {
        store,
        meta: {},
        model,
        result: items,
        marker,
        operation: 'write',
      })
    },
    writeItemForRelation({ model, relationKey, relation, item }) {
      const store = getStore()
      const possibleTypes = Object.keys(relation.to)
      const nestedItemType = store.getModel(item, possibleTypes)
      if (!nestedItemType) {
        throw new Error(`Could not determine type for relation ${model.name}.${String(relationKey)}`)
      }
      const nestedKey = nestedItemType.getKey(item)
      if (!nestedKey) {
        throw new Error(`Could not determine key for relation ${model.name}.${String(relationKey)}`)
      }

      store.processItemParsing(model, item)

      this.writeItem({
        model: nestedItemType,
        key: nestedKey,
        item,
      })
    },
    deleteItem({ model, key }) {
      delete state.value[model.name]?.[key]
      wrappedItems.delete(getWrappedItemCacheKey(model, key))
      const store = getStore()
      store.hooks.callHookSync('afterCacheWrite', {
        store,
        meta: {},
        model,
        key,
        operation: 'delete',
      })
    },
    getState() {
      return toRaw(state.value)
    },
    setState(value) {
      state.value = value
      wrappedItems.clear()

      const store = getStore()
      store.hooks.callHookSync('afterCacheReset', {
        store,
        meta: {},
      })
    },
    clear() {
      state.value = {}
      wrappedItems.clear()

      const store = getStore()
      store.hooks.callHookSync('afterCacheReset', {
        store,
        meta: {},
      })
    },
    // @ts-expect-error private
    _private: {
      state,
      wrappedItems,
    },
  }
}
