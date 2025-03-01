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
  const state = ref<Record<string, any>>({})

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
      if (!state.value._markers?.[marker]) {
        return []
      }
      return Object.values<any>(state.value[type.name] ?? {}).map(item => getWrappedItem(type, item)).filter(Boolean) as WrappedItem<any, any, any>[]
    },
    writeItem({ type, key, item, marker }) {
      let typeItems = state.value[type.name]
      if (!typeItems) {
        typeItems = state.value[type.name] = {}
      }
      item = pickNonSpecialProps(item)
      if (!typeItems[key]) {
        typeItems[key] = item
      }
      else {
        Object.assign(typeItems[key], item)
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
