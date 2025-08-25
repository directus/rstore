import type { CustomHookMeta, Model, ModelDefaults, ResolvedModel, ResolvedModelItem, StoreCore, StoreSchema } from '@rstore/shared'
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
}: CreateOptions<TModel, TModelDefaults, TSchema>): Promise<ResolvedModelItem<TModel, TModelDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

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

  return result
}
