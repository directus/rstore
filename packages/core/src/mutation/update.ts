import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps, set } from '@rstore/shared'
import { peekFirst } from '../query'

export interface UpdateOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  key?: string | number | null
  skipCache?: boolean
  optimistic?: boolean | Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
}

export async function updateItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  item,
  key,
  skipCache,
  optimistic = true,
}: UpdateOptions<TCollection, TCollectionDefaults, TSchema>): Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  const originalItem = item

  item = pickNonSpecialProps(item, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

  key ??= collection.getKey(item)

  if (!key) {
    throw new Error('Item update failed: key is not defined')
  }

  // Check if existing item has a layer that prevents update
  const existingItem = store.$cache.readItem({ collection, key })
  if (existingItem?.$layer) {
    const layer = existingItem.$layer as CacheLayer
    if (layer.prevent?.update) {
      console.error(layer)
      throw new Error(`Item update prevented by the layer: ${layer.id}`)
    }
  }

  store.$processItemSerialization(collection, item)

  await store.$hooks.callHook('beforeMutation', {
    store,
    meta,
    collection,
    mutation: 'update',
    key,
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
    },
  })

  let result: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | null = peekFirst({
    store,
    meta,
    collection,
    findOptions: {
      key,
    },
  }).result

  if (result) {
    result = pickNonSpecialProps(result) as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
  }

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    layer = {
      id: crypto.randomUUID(),
      state: {
        [collection.name]: {
          [key]: {
            ...originalItem,
            ...typeof optimistic === 'object' ? optimistic : {},
            $overrideKey: key,
          },
        },
      },
      deletedItems: {},
      optimistic: true,
    }

    store.$cache.addLayer(layer)
  }

  try {
    const abort = store.$hooks.withAbort()
    await store.$hooks.callHook('updateItem', {
      store,
      meta,
      collection,
      key,
      item,
      getResult: () => result ?? undefined,
      setResult: (newResult, options) => {
        result = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
        if (result && options?.abort !== false) {
          abort()
        }
      },
      abort,
    })

    await store.$hooks.callHook('afterMutation', {
      store,
      meta,
      collection,
      mutation: 'update',
      key,
      item,
      getResult: () => result ?? undefined,
      setResult: (newResult) => {
        result = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
      },
    })

    if (result) {
      store.$processItemParsing(collection, result)

      if (!skipCache) {
        if (layer) {
          store.$cache.removeLayer(layer.id)
        }

        store.$cache.writeItem({
          collection,
          key,
          item: result,
        })
      }
    }
    else {
      throw new Error('Item update failed: result is nullish')
    }

    store.$mutationHistory.push({
      operation: 'update',
      collection,
      key,
      payload: item,
    })
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    if (layer) {
      store.$cache.removeLayer(layer.id)
    }
    throw error
  }

  return result
}
