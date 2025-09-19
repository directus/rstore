import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'

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
    store,
    meta,
    collection,
    mutation: 'delete',
    keys,
    setItems: () => {},
  })

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    layer = {
      id: crypto.randomUUID(),
      state: {},
      deletedItems: {
        [collection.name]: new Set(keys),
      },
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
      store,
      meta,
      collection,
      keys,
      abort,
    })

    if (!aborted) {
      await Promise.all(keys.map(async (key) => {
        const abort = store.$hooks.withAbort()
        await store.$hooks.callHook('deleteItem', {
          store,
          meta,
          collection,
          key,
          abort,
        })

        await store.$hooks.callHook('afterMutation', {
          store,
          meta,
          collection,
          mutation: 'delete',
          key,
          getResult: () => undefined,
          setResult: () => {},
        })
      }))
    }

    await store.$hooks.callHook('afterManyMutation', {
      store,
      meta,
      collection,
      mutation: 'delete',
      keys,
      getResult: () => [],
      setResult: () => {},
    })

    if (!skipCache) {
      if (layer) {
        store.$cache.removeLayer(layer.id)
      }

      for (const key of keys) {
        store.$cache.deleteItem({
          collection,
          key,
        })
      }
    }

    store.$mutationHistory.push({
      operation: 'delete',
      collection,
      keys,
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
