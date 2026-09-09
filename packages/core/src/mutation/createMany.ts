import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { finalizeMutation } from './finalizeMutation'
import { createOptimisticLayerLifecycle, prepareMutationItems } from './optimistic'

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
  items: inputItems,
  skipCache,
  optimistic = true,
}: CreateManyOptions<TCollection, TCollectionDefaults, TSchema>): Promise<Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>> {
  const meta: CustomHookMeta = {}

  let preparedItems = prepareMutationItems(store, collection, inputItems)
  let layerItems = preparedItems.map(({ optimisticItem }) => optimisticItem)
  const transportItems = preparedItems.map(({ transportItem }) => transportItem)

  let result: Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> = []

  await store.$hooks.callHook('beforeManyMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'create',
    items: transportItems,
    setItems: (newItems) => {
      preparedItems = prepareMutationItems(store, collection, newItems as typeof inputItems, preparedItems)
      layerItems = preparedItems.map(({ optimisticItem }) => optimisticItem)
      // Keep the hook payload current for later callbacks in the same dispatch.
      transportItems.splice(0, transportItems.length, ...preparedItems.map(({ transportItem }) => transportItem))
    },
  })

  const optimisticLayer = createOptimisticLayerLifecycle(store)

  if (!skipCache && optimistic) {
    const optimisticState: Record<string, any> = {}
    for (const item of layerItems) {
      // Key and body share the application/cache shape, including replacements.
      let key = collection.getKey(item)
      if (key == null) {
        key = crypto.randomUUID()
      }
      optimisticState[key] = {
        ...item,
        ...typeof optimistic === 'object' ? optimistic : {},
        $overrideKey: key,
      }
    }
    const layer: CacheLayer = {
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
    optimisticLayer.add(layer)
  }

  try {
    let aborted = false
    const _abort = store.$hooks.withAbort({ explicit: true })
    const abort = () => {
      _abort()
      aborted = true
    }
    await store.$hooks.callHook('createMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      items: transportItems,
      getResult: () => result,
      setResult: (newResult, options) => {
        result = newResult as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
        if (result.length && options?.abort !== false) {
          abort()
        }
      },
      abort,
    }, _abort)

    // In case the createMany didn't abort (= wasn't handled), we call createItem for each item
    if (!aborted) {
      // The per-item calls stay concurrent, so their results are collected by
      // input index instead of by completion: the returned rows, and the
      // per-item hooks reading them back, stay aligned with the sent items.
      const singleResults: Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | undefined> = await Promise.all(transportItems.map(async (transportItem) => {
        let singleResult: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | undefined
        const abort = store.$hooks.withAbort({ explicit: true })
        await store.$hooks.callHook('createItem', {
          store: store as unknown as GlobalStoreType,
          meta,
          collection,
          item: transportItem,
          getResult: () => singleResult,
          setResult: (newResult, options) => {
            singleResult = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
            if (singleResult && options?.abort !== false) {
              abort()
            }
          },
          abort,
        }, abort)

        return singleResult
      }))

      for (const singleResult of singleResults) {
        // An item no plugin answered contributes nothing.
        if (singleResult) {
          result.push(singleResult)
        }
      }
    }

    const commitResult = await finalizeMutation(store, {
      meta,
      collection,
      mutation: 'create',
      items: transportItems,
      results: result,
      skipCache,
    }, {
      emitItemHooks: !aborted,
      onBeforeApplyCache: optimisticLayer.remove,
    })

    result = commitResult.results as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> ?? []
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    optimisticLayer.remove()
    throw error
  }

  return result
}
