import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema, WriteItem } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'
import { unwrapItem } from '../item'
import { isKeyDefined } from '../key'

export interface CreateManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
  skipCache?: boolean
  optimistic?: boolean | Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
}

export async function createMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  items,
  skipCache,
  optimistic = true,
}: CreateManyOptions<TCollection, TCollectionDefaults, TSchema>): Promise<Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>> {
  const meta: CustomHookMeta = {}

  const originalItems = items

  items = items.map((item) => {
    const processedItem = pickNonSpecialProps(item, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
    store.$processItemSerialization(collection, item)
    return processedItem
  })

  let result: Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> = []

  await store.$hooks.callHook('beforeManyMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'create',
    items,
    setItems: (newItems) => {
      items = newItems as Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
    },
  })

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    const optimisticState: Record<string, any> = {}
    for (const i in items) {
      const item = items[i]
      let key = collection.getKey(item)
      if (key == null) {
        key = crypto.randomUUID()
      }
      optimisticState[key] = {
        ...originalItems[i],
        ...typeof optimistic === 'object' ? optimistic : {},
        $overrideKey: key,
      }
    }
    layer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: optimisticState,
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
    let aborted = false
    const _abort = store.$hooks.withAbort()
    const abort = () => {
      _abort()
      aborted = true
    }
    await store.$hooks.callHook('createMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      items,
      getResult: () => result,
      setResult: (newResult, options) => {
        result = newResult as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
        if (result.length && options?.abort !== false) {
          abort()
        }
      },
      abort,
    })

    // In case the createMany didn't abort (= wasn't handled), we call createItem for each item
    if (!aborted) {
      await Promise.all(items.map(async (item) => {
        let singleResult: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | undefined
        const abort = store.$hooks.withAbort()
        await store.$hooks.callHook('createItem', {
          store: store as unknown as GlobalStoreType,
          meta,
          collection,
          item,
          getResult: () => singleResult,
          setResult: (newResult, options) => {
            singleResult = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
            if (singleResult && options?.abort !== false) {
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
          getResult: () => singleResult,
          setResult: (newResult) => {
            singleResult = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
          },
        })

        if (singleResult) {
          result.push(singleResult)
        }
      }))
    }

    await store.$hooks.callHook('afterManyMutation', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      mutation: 'create',
      items: items.map(item => ({ item })),
      getResult: () => result,
      setResult: (newResult) => {
        result = newResult as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
      },
    })

    if (result.length) {
      const newResult = [] as typeof result

      for (const item of result) {
        const unwrappedItem = unwrapItem(item)
        store.$processItemParsing(collection, unwrappedItem)
        newResult.push(unwrappedItem)
      }

      result = newResult

      if (!skipCache) {
        if (layer) {
          store.$cache.removeLayer(layer.id)
        }

        const items = result
        const writes: Array<WriteItem<TCollection, TCollectionDefaults, TSchema>> = []
        for (const item of items) {
          const key = collection.getKey(item)
          if (!isKeyDefined(key)) {
            console.warn(`Key is undefined for ${collection.name}. Item was not written to cache.`)
            continue
          }
          writes.push({ key, value: item })
        }
        if (writes.length) {
          store.$cache.writeItems<TCollection>({
            collection,
            items: writes,
          })
        }
      }
    }

    store.$mutationHistory.push({
      operation: 'create',
      collection,
      payload: items,
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
