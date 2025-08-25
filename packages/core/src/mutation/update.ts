import type { CustomHookMeta, Model, ModelDefaults, ResolvedModel, ResolvedModelItem, StoreCore, StoreSchema } from '@rstore/shared'
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
}: UpdateOptions<TModel, TModelDefaults, TSchema>): Promise<ResolvedModelItem<TModel, TModelDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

  store.$processItemSerialization(model, item)

  key = key ?? model.getKey(item)

  if (!key) {
    throw new Error('Item update failed: key is not defined')
  }

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

  return result
}
