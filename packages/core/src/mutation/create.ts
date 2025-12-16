import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps, set } from '@rstore/shared'
import { unwrapItem } from '../item'

export interface CreateOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  skipCache?: boolean
  optimistic?: boolean | Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
}

export async function createItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  item,
  skipCache,
  optimistic = true,
}: CreateOptions<TCollection, TCollectionDefaults, TSchema>): Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  const originalItem = item

  item = pickNonSpecialProps(item, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

  store.$processItemSerialization(collection, item)

  let result: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | undefined

  await store.$hooks.callHook('beforeMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'create',
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
    },
  })

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    let key = collection.getKey(item)
    if (key == null) {
      key = crypto.randomUUID()
    }
    layer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: {
        [key]: {
          ...originalItem,
          ...typeof optimistic === 'object' ? optimistic : {},
          $overrideKey: key,
        },
      },
      deletedItems: new Set(),
      optimistic: true,
      prevent: {
        // @TODO queue mutations and reconcile the optimistic object with the actual result
        update: true,
        delete: true,
      },
    }
    store.$cache.addLayer(layer)
  }

  try {
    const abort = store.$hooks.withAbort()
    await store.$hooks.callHook('createItem', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      item,
      getResult: () => result,
      setResult: (newResult, options) => {
        result = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
        if (result && options?.abort !== false) {
          abort()
        }
      },
      abort,
    })

    await store.$hooks.callHook('afterMutation', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      mutation: 'create',
      item,
      getResult: () => result,
      setResult: (newResult) => {
        result = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
      },
    })

    if (result) {
      result = unwrapItem(result)

      store.$processItemParsing(collection, result)

      if (!skipCache) {
        if (layer) {
          store.$cache.removeLayer(layer.id)
        }

        const key = collection.getKey(result)

        if (key) {
          store.$cache.writeItem({
            collection,
            key,
            item: result as NonNullable<typeof result>,
          })
        }
        else {
          throw new Error('Item creation failed: key is not defined')
        }
      }
    }
    else {
      throw new Error('Item creation failed: result is nullish')
    }

    store.$mutationHistory.push({
      operation: 'create',
      collection,
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

  return result as NonNullable<typeof result>
}
