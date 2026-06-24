import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { finalizeMutation } from './finalizeMutation'

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
    const item = store.$cache.readItem({ collection, key })
    if (item?.$layer) {
      const layer = item.$layer as CacheLayer
      if (layer.prevent?.delete) {
        console.error(layer)
        throw new Error(`Item deletion prevented by the layer: ${layer.id}`)
      }
    }
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

  let layer: CacheLayer | undefined
  const removeOptimisticLayer = () => {
    if (layer) {
      store.$cache.removeLayer(layer.id)
      layer = undefined
    }
  }

  if (!skipCache && optimistic) {
    layer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: {},
      deletedItems: new Set(keys),
      optimistic: true,
    }
    store.$cache.addLayer(layer)
  }

  try {
    const _abort = store.$hooks.withAbort()
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
    })

    if (!aborted) {
      await Promise.all(keys.map(async (key) => {
        const abort = store.$hooks.withAbort()
        await store.$hooks.callHook('deleteItem', {
          store: store as unknown as GlobalStoreType,
          meta,
          collection,
          key,
          abort,
        })
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
      onBeforeApplyCache: removeOptimisticLayer,
    })
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    removeOptimisticLayer()
    throw error
  }
}
