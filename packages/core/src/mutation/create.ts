import type { CacheLayer, CustomHookMeta, Model, ModelDefaults, ResolvedModel, ResolvedModelItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps, set } from '@rstore/shared'

export interface CreateOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  item: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
  skipCache?: boolean
  optimistic?: boolean | Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
}

export async function createItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  model,
  item,
  skipCache,
  optimistic = true,
}: CreateOptions<TModel, TModelDefaults, TSchema>): Promise<ResolvedModelItem<TModel, TModelDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  const originalItem = item

  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

  store.$processItemSerialization(model, item)

  let result: ResolvedModelItem<TModel, TModelDefaults, TSchema> | undefined

  await store.$hooks.callHook('beforeMutation', {
    store,
    meta,
    model,
    mutation: 'create',
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem as Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
    },
  })

  let layer: CacheLayer | undefined

  if (!skipCache && optimistic) {
    let key = model.getKey(item)
    if (!key) {
      key = crypto.randomUUID()
    }
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
      prevent: {
        // @TODO queue mutations and reconcile the optimistic object with the actual result
        update: true,
        delete: true,
      },
    }
    store.$cache.addLayer(layer)
  }

  try {
    await store.$hooks.callHook('createItem', {
      store,
      meta,
      model,
      item,
      getResult: () => result,
      setResult: (newResult) => {
        result = newResult as ResolvedModelItem<TModel, TModelDefaults, TSchema>
      },
    })

    await store.$hooks.callHook('afterMutation', {
      store,
      meta,
      model,
      mutation: 'create',
      item,
      getResult: () => result,
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

        const key = model.getKey(result)

        if (key) {
          store.$cache.writeItem({
            model,
            key,
            item: result,
          })
        }
        else {
          throw new Error('Item creation failed: key is not defined')
        }
      }
    }
    else {
      throw new Error('Item creation failed: result is nullish')
    }

    store.$mutationHistory.push({
      operation: 'create',
      model,
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
