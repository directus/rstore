import type { CacheLayer, CustomHookMeta, Model, ModelDefaults, ResolvedModel, ResolvedModelItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps, set } from '@rstore/shared'
import { peekFirst } from '../query'

export interface UpdateOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  item: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
  key?: string | number | null
  skipCache?: boolean
  optimistic?: boolean | Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
}

export async function updateItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  model,
  item,
  key,
  skipCache,
  optimistic = true,
}: UpdateOptions<TModel, TModelDefaults, TSchema>): Promise<ResolvedModelItem<TModel, TModelDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  const originalItem = item

  item = pickNonSpecialProps(item, true) as Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

  key = key ?? model.getKey(item)

  if (!key) {
    throw new Error('Item update failed: key is not defined')
  }

  // Check if existing item has a layer that prevents update
  const existingItem = store.$cache.readItem({ model, key })
  if (existingItem?.$layer) {
    const layer = existingItem.$layer as CacheLayer
    if (layer.prevent?.update) {
      console.error(layer)
      throw new Error(`Item update prevented by the layer: ${layer.id}`)
    }
  }

  store.$processItemSerialization(model, item)

  await store.$hooks.callHook('beforeMutation', {
    store,
    meta,
    model,
    mutation: 'update',
    key,
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem as Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
    },
  })

  let result: ResolvedModelItem<TModel, TModelDefaults, TSchema> | null = peekFirst({
    store,
    meta,
    model,
    findOptions: {
      key,
    },
  }).result

  if (result) {
    result = pickNonSpecialProps(result) as ResolvedModelItem<TModel, TModelDefaults, TSchema>
  }

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    layer = {
      id: crypto.randomUUID(),
      state: {
        [model.name]: {
          [key]: {
            ...originalItem,
            ...typeof optimistic === 'object' ? optimistic : {},
            $overrideKey: key,
          },
        },
      },
      deletedItems: {},
      optimistic: true,
    }

    store.$cache.addLayer(layer)
  }

  try {
    await store.$hooks.callHook('updateItem', {
      store,
      meta,
      model,
      key,
      item,
      getResult: () => result ?? undefined,
      setResult: (newResult) => {
        result = newResult as ResolvedModelItem<TModel, TModelDefaults, TSchema>
      },
    })

    await store.$hooks.callHook('afterMutation', {
      store,
      meta,
      model,
      mutation: 'update',
      key,
      item,
      getResult: () => result ?? undefined,
      setResult: (newResult) => {
        result = newResult as ResolvedModelItem<TModel, TModelDefaults, TSchema>
      },
    })

    if (result) {
      store.$processItemParsing(model, result)

      if (!skipCache) {
        if (layer) {
          store.$cache.removeLayer(layer.id)
        }

        store.$cache.writeItem({
          model,
          key,
          item: result,
        })
      }
    }
    else {
      throw new Error('Item update failed: result is nullish')
    }

    store.$mutationHistory.push({
      operation: 'update',
      model,
      key,
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

  return result
}
