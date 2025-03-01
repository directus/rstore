import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { type Model, type ModelDefaults, type ModelType, pickNonSpecialProps, type ResolvedModelItem, type ResolvedModelType, set, type StoreCore } from '@rstore/shared'
import { peekFirst } from '../query'

export interface UpdateOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>
  item: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  key?: string | null
  skipCache?: boolean
}

export async function updateItem<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  type,
  item,
  key,
  skipCache,
}: UpdateOptions<TModelType, TModelDefaults, TModel>): Promise<ResolvedModelItem<TModelType, TModelDefaults, TModel>> {
  const meta: CustomHookMeta = {}

  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  key = key ?? type.getKey(item)

  if (!key) {
    throw new Error('Item update failed: key is not defined')
  }

  await store.hooks.callHook('beforeMutation', {
    store,
    meta,
    type,
    mutation: 'update',
    key,
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem
    },
  })

  let result: ResolvedModelItem<TModelType, TModelDefaults, TModel> | null = peekFirst({
    store,
    meta,
    type,
    findOptions: {
      key,
    },
  }).result

  if (result) {
    result = pickNonSpecialProps(result) as ResolvedModelItem<TModelType, TModelDefaults, TModel>
  }

  await store.hooks.callHook('updateItem', {
    store,
    meta,
    type,
    key,
    item,
    getResult: () => result,
    setResult: (newResult) => {
      result = newResult
    },
  })

  await store.hooks.callHook('afterMutation', {
    store,
    meta,
    type,
    mutation: 'update',
    key,
    item,
    getResult: () => result,
    setResult: (newResult) => {
      result = newResult
    },
  })

  if (result) {
    store.processItemParsing(type, result)

    if (!skipCache) {
      store.cache.writeItem({
        type,
        key,
        item: result,
      })
    }
  }
  else {
    throw new Error('Item update failed: result is nullish')
  }

  store.mutationHistory.push({
    operation: 'update',
    type,
    key,
    payload: item,
  })

  return result
}
