import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { type Model, type ModelDefaults, type ModelMap, pickNonSpecialProps, type ResolvedModel, type ResolvedModelItem, set, type StoreCore } from '@rstore/shared'
import { peekFirst } from '../query'

export interface UpdateOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> {
  store: StoreCore<TModelMap, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelMap>
  item: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
  key?: string | null
  skipCache?: boolean
}

export async function updateItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
>({
  store,
  model,
  item,
  key,
  skipCache,
}: UpdateOptions<TModel, TModelDefaults, TModelMap>): Promise<ResolvedModelItem<TModel, TModelDefaults, TModelMap>> {
  const meta: CustomHookMeta = {}

  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
  key = key ?? model.getKey(item)

  if (!key) {
    throw new Error('Item update failed: key is not defined')
  }

  await store.hooks.callHook('beforeMutation', {
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
      item = newItem
    },
  })

  let result: ResolvedModelItem<TModel, TModelDefaults, TModelMap> | null = peekFirst({
    store,
    meta,
    model,
    findOptions: {
      key,
    },
  }).result

  if (result) {
    result = pickNonSpecialProps(result) as ResolvedModelItem<TModel, TModelDefaults, TModelMap>
  }

  await store.hooks.callHook('updateItem', {
    store,
    meta,
    model,
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
    model,
    mutation: 'update',
    key,
    item,
    getResult: () => result,
    setResult: (newResult) => {
      result = newResult
    },
  })

  if (result) {
    store.processItemParsing(model, result)

    if (!skipCache) {
      store.cache.writeItem({
        model,
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
    model,
    key,
    payload: item,
  })

  return result
}
