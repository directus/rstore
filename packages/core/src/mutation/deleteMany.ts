import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { finalizeMutation } from './finalizeMutation'
import { assertMutationAllowed, createOptimisticLayerLifecycle } from './optimistic'

export interface DeleteManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  keys: Array<string | number>
  skipCache?: boolean
  optimistic?: boolean
}

export async function deleteMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  keys,
  skipCache,
  optimistic = true,
}: DeleteManyOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  for (const key of keys) {
    assertMutationAllowed(store, collection, key, 'delete')
  }

  const meta: CustomHookMeta = {}

  await store.$hooks.callHook('beforeManyMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'delete',
    keys,
    setItems: () => {},
  })

  const optimisticLayer = createOptimisticLayerLifecycle(store)

  if (!skipCache && optimistic) {
    const layer: CacheLayer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: {},
      deletedItems: new Set(keys),
      optimistic: true,
    }
    optimisticLayer.add(layer)
  }

  try {
    const _abort = store.$hooks.withAbort({ explicit: true })
    let aborted = false
    const abort = () => {
      aborted = true
      _abort()
    }
    await store.$hooks.callHook('deleteMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      keys,
      abort,
    }, _abort)

    if (!aborted) {
      await Promise.all(keys.map(async (key) => {
        const abort = store.$hooks.withAbort({ explicit: true })
        await store.$hooks.callHook('deleteItem', {
          store: store as unknown as GlobalStoreType,
          meta,
          collection,
          key,
          abort,
        }, abort)
      }))
    }

    await finalizeMutation(store, {
      meta,
      collection,
      mutation: 'delete',
      keys,
      skipCache,
    }, {
      emitItemHooks: !aborted,
      onBeforeApplyCache: optimisticLayer.remove,
    })
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    optimisticLayer.remove()
    throw error
  }
}
