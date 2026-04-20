import type { BatchCallConfig, CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { resolveBatchCall } from '../batch'

export interface DeleteOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  key: string | number
  skipCache?: boolean
  optimistic?: boolean

  /**
   * Whether this mutation should participate in batching.
   * Only applies when store-level batching is enabled.
   *
   * - `false` — opt out of batching
   * - `true` (or omitted) — join the default group
   * - `{ group: 'name' }` — join a specific batch group
   *
   * @default true
   */
  batch?: BatchCallConfig
}

export async function deleteItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  key,
  skipCache,
  optimistic = true,
  batch,
}: DeleteOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  const item = store.$cache.readItem({ collection, key })
  if (item?.$layer) {
    const layer = item.$layer as CacheLayer
    if (layer.prevent?.delete) {
      console.error(layer)
      throw new Error(`Item deletion prevented by the layer: ${layer.id}`)
    }
  }

  const meta: CustomHookMeta = {}

  await store.$hooks.callHook('beforeMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'delete',
    key,
    modifyItem: () => {},
    setItem: () => {},
  })

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    layer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: {},
      deletedItems: new Set([key]),
      optimistic: true,
    }
    store.$cache.addLayer(layer)
  }

  try {
    // Batching: enqueue into batch scheduler if eligible
    const batchCall = resolveBatchCall(batch)
    if (store.$batch && batchCall.enabled) {
      await store.$batch.enqueueDelete(collection, key, meta, batchCall.group)
    }
    else {
      const abort = store.$hooks.withAbort()
      await store.$hooks.callHook('deleteItem', {
        store: store as unknown as GlobalStoreType,
        meta,
        collection,
        key,
        abort,
      })
    }

    await store.$hooks.callHook('afterMutation', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      mutation: 'delete',
      key,
      getResult: () => undefined,
      setResult: () => {},
    })

    if (!skipCache) {
      if (layer) {
        store.$cache.removeLayer(layer.id)
      }

      store.$cache.deleteItem({
        collection,
        key,
      })
    }

    store.$mutationHistory.push({
      operation: 'delete',
      collection,
      key,
    })
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    if (layer) {
      store.$cache.removeLayer(layer.id)
    }
    throw error
  }
}
