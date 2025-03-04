import type { VueStore } from './store'
import { type Cache, type Model, type ModelDefaults, type ModelType, pickNonSpecialProps, type ResolvedModelItem, type ResolvedModelType, type WrappedItem } from '@rstore/shared'
import { ref } from 'vue'
import { wrapItem } from './item'

export interface CreateCacheOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
> {
  getStore: () => VueStore<TModel, TModelDefaults>
}

export function createCache<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
>({
  getStore,
}: CreateCacheOptions<TModel, TModelDefaults>): Cache {
  const state = ref<Record<string, any>>({
    _markers: {},
  })

  const wrappedItems = new Map<string, WrappedItem<any, any, any>>()

  function getWrappedItemCacheKey<TModelType extends ModelType>(
    type: ResolvedModelType<TModelType, TModelDefaults, TModel>,
    key: string,
  ) {
    return `${type.name}:${key}`
  }

  function getWrappedItem<TModelType extends ModelType>(
    type: ResolvedModelType<TModelType, TModelDefaults, TModel>,
    item: ResolvedModelItem<TModelType, TModelDefaults, TModel> | null | undefined,
  ): WrappedItem<TModelType, TModelDefaults, TModel> | undefined {
    if (!item) {
      return undefined
    }
    const key = type.getKey(item)
    if (!key) {
      throw new Error('Key is required on item to get wrapped')
    }
    const cacheKey = getWrappedItemCacheKey(type, key)
    let wrappedItem = wrappedItems.get(cacheKey)
    if (!wrappedItem) {
      wrappedItem = wrapItem({
        store: getStore(),
        type,
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
    readItem({ type, key }) {
      return getWrappedItem(type, state.value[type.name]?.[key])
    },
    readItems({ type, marker }) {
      if (marker && !state.value._markers?.[marker]) {
        return []
      }
      return Object.values<any>(state.value[type.name] ?? {}).map(item => getWrappedItem(type, item)).filter(Boolean) as WrappedItem<any, any, any>[]
    },
    writeItem({ type, key, item, marker }) {
      let itemsForType = state.value[type.name]
      if (!itemsForType) {
        itemsForType = state.value[type.name] = {}
      }
      const rawData = pickNonSpecialProps(item)

      // Handle relations
      const data = {} as Record<string, any>
      for (const key in rawData) {
        if (key in type.relations) {
          const relation = type.relations[key]
          const rawItem = rawData[key]

          if (relation.many && !Array.isArray(rawItem)) {
            throw new Error(`Expected array for relation ${type.name}.${key}`)
          }
          else if (!relation.many && Array.isArray(rawItem)) {
            throw new Error(`Expected object for relation ${type.name}.${key}`)
          }

          if (Array.isArray(rawItem)) {
            for (const nestedItem of rawItem as any[]) {
              this.writeItemForRelation({
                type,
                relationKey: key,
                relation,
                item: nestedItem,
              })
            }
          }
          else {
            this.writeItemForRelation({
              type,
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
    },
    writeItems({ type, items, marker }) {
      for (const { key, value: item } of items) {
        this.writeItem({ type, key, item })
      }
      mark(marker)
    },
    writeItemForRelation({ type, relationKey, relation, item }) {
      const store = getStore()
      const possibleTypes = Object.keys(relation.to)
      const nestedItemType = store.getType(item, possibleTypes)
      if (!nestedItemType) {
        throw new Error(`Could not determine type for relation ${type.name}.${String(relationKey)}`)
      }
      const nestedKey = nestedItemType.getKey(item)
      if (!nestedKey) {
        throw new Error(`Could not determine key for relation ${type.name}.${String(relationKey)}`)
      }

      store.processItemParsing(type, item)

      this.writeItem({
        type: nestedItemType,
        key: nestedKey,
        item,
      })
    },
    deleteItem({ type, key }) {
      delete state.value[type.name]?.[key]
      wrappedItems.delete(getWrappedItemCacheKey(type, key))
    },
    getState() {
      return state.value
    },
    setState(value) {
      state.value = value
      wrappedItems.clear()
    },
    clear() {
      state.value = {}
      wrappedItems.clear()
    },
    // @ts-expect-error private
    _private: {
      state,
      wrappedItems,
    },
  }
}
