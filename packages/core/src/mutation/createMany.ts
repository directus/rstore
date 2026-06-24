import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'
import { finalizeMutation } from './finalizeMutation'

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
  const removeOptimisticLayer = () => {
    if (layer) {
      store.$cache.removeLayer(layer.id)
      layer = undefined
    }
  }

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

        if (singleResult) {
          result.push(singleResult)
        }
      }))
    }

    const commitResult = await finalizeMutation(store, {
      meta,
      collection,
      mutation: 'create',
      items,
      results: result,
      skipCache,
    }, {
      emitItemHooks: !aborted,
      onBeforeApplyCache: removeOptimisticLayer,
    })

    result = commitResult.results as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> ?? []
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    removeOptimisticLayer()
    throw error
  }

  return result
}
