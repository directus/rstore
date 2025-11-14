import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema, WriteItem } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'
import { peekMany } from '../query'

export interface UpdateManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
  skipCache?: boolean
  optimistic?: boolean | Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
}

export async function updateMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  items,
  skipCache,
  optimistic = true,
}: UpdateManyOptions<TCollection, TCollectionDefaults, TSchema>): Promise<Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>> {
  const meta: CustomHookMeta = {}

  const originalItems = items
  const allKeys = new Set<string | number>()

  function getItemsWithKey(items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>) {
    return items.map((item) => {
      const key = collection.getKey(item)
      if (key == null) {
        throw new Error('Item update failed: key is not defined')
      }
      allKeys.add(key)

      // Check if existing item has a layer that prevents update
      const existingItem = store.$cache.readItem({ collection, key })
      if (existingItem?.$layer) {
        const layer = existingItem.$layer as CacheLayer
        if (layer.prevent?.update) {
          console.error(layer)
          throw new Error(`Item update prevented by the layer: ${layer.id}`)
        }
      }

      const processedItem = pickNonSpecialProps(item, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
      store.$processItemSerialization(collection, item)
      return {
        key,
        item: processedItem,
      }
    })
  }

  let itemsWithKey = getItemsWithKey(items)

  await store.$hooks.callHook('beforeManyMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'update',
    items: itemsWithKey,
    setItems: (newItems) => {
      itemsWithKey = getItemsWithKey(newItems as Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>)
    },
  })

  let result: Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> = skipCache
    ? []
    : peekMany({
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions: {
        filter: (item) => {
          const key = collection.getKey(item)
          return key && allKeys.has(key)
        },
      },
    }).result

  if (result.length) {
    result = result.map(item => pickNonSpecialProps(item) as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>)
  }

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    const optimisticState: Record<string, any> = {}
    for (const i in itemsWithKey) {
      const { key } = itemsWithKey[i]!
      const originalItem = originalItems[i]!
      const optimisticOverride = Array.isArray(optimistic) ? optimistic[i] : {}
      optimisticState[key] = {
        ...originalItem,
        ...optimisticOverride,
        $overrideKey: key,
      }
    }
    layer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: optimisticState,
      deletedItems: new Set(),
      optimistic: true,
    }

    store.$cache.addLayer(layer)
  }

  try {
    const _abort = store.$hooks.withAbort()
    let aborted = false
    const abort = () => {
      _abort()
      aborted = true
    }
    await store.$hooks.callHook('updateMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      items: itemsWithKey,
      getResult: () => result,
      setResult: (newResult, options) => {
        result = newResult as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
        if (result.length && options?.abort !== false) {
          abort()
        }
      },
      abort,
    })

    // If the operation wasn't aborted (= wasn't handled), we perform updateItem for each item
    if (!aborted) {
      await Promise.all(itemsWithKey.map(async ({ key, item }) => {
        let singleResult: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | undefined

        const abort = store.$hooks.withAbort()
        await store.$hooks.callHook('updateItem', {
          store: store as unknown as GlobalStoreType,
          meta,
          collection,
          key,
          item,
          getResult: () => singleResult ?? undefined,
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
          mutation: 'update',
          key,
          item,
          getResult: () => singleResult ?? undefined,
          setResult: (newResult) => {
            singleResult = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
          },
        })

        if (singleResult) {
          const index = result.findIndex(r => collection.getKey(r) === key)
          if (index > -1) {
            result[index] = {
              ...result[index]!,
              ...singleResult,
            }
          }
          else {
            result.push(singleResult)
          }
        }
      }))
    }

    await store.$hooks.callHook('afterManyMutation', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      mutation: 'update',
      items: itemsWithKey,
      getResult: () => result ?? undefined,
      setResult: (newResult) => {
        result = newResult as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
      },
    })

    if (result.length) {
      for (const item of result) {
        store.$processItemParsing(collection, item)
      }

      if (!skipCache) {
        if (layer) {
          store.$cache.removeLayer(layer.id)
        }

        const items = result
        const writes: Array<WriteItem<TCollection, TCollectionDefaults, TSchema>> = []
        for (const item of items) {
          const key = collection.getKey(item)
          if (key == null) {
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

      // Sort result to match the order of input items
      const resultByKey: Record<string | number, ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> = {}
      for (const item of result) {
        const key = collection.getKey(item)
        if (key) {
          resultByKey[key] = item
        }
      }
      result = itemsWithKey.map(({ key }) => resultByKey[key]).filter(Boolean) as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
    }

    store.$mutationHistory.push({
      operation: 'update',
      collection,
      payload: itemsWithKey,
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
