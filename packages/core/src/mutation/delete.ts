import type { CacheLayer, CustomHookMeta, Model, ModelDefaults, ResolvedModel, StoreCore, StoreSchema } from '@rstore/shared'

export interface DeleteOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  key: string | number
  skipCache?: boolean
  optimistic?: boolean
}

export async function deleteItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  model,
  key,
  skipCache,
  optimistic = true,
}: DeleteOptions<TModel, TModelDefaults, TSchema>): Promise<void> {
  const item = store.$cache.readItem({ model, key })
  if (item?.$layer) {
    const layer = item.$layer as CacheLayer
    if (layer.prevent?.delete) {
      console.error(layer)
      throw new Error(`Item deletion prevented by the layer: ${layer.id}`)
    }
  }

  const meta: CustomHookMeta = {}

  await store.$hooks.callHook('beforeMutation', {
    store,
    meta,
    model,
    mutation: 'delete',
    key,
    modifyItem: () => {},
    setItem: () => {},
  })

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    layer = {
      id: crypto.randomUUID(),
      state: {},
      deletedItems: {
        [model.name]: new Set([key]),
      },
      optimistic: true,
    }
    store.$cache.addLayer(layer)
  }

  try {
    await store.$hooks.callHook('deleteItem', {
      store,
      meta,
      model,
      key,
    })

    await store.$hooks.callHook('afterMutation', {
      store,
      meta,
      model,
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
        model,
        key,
      })
    }

    store.$mutationHistory.push({
      operation: 'delete',
      model,
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
