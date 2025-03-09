import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { type Model, type ModelDefaults, type ModelMap, pickNonSpecialProps, type ResolvedModel, type ResolvedModelItem, set, type StoreCore } from '@rstore/shared'

export interface CreateOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> {
  store: StoreCore<TModelMap, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelMap>
  item: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
  skipCache?: boolean
}

export async function createItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
>({
  store,
  model,
  item,
  skipCache,
}: CreateOptions<TModel, TModelDefaults, TModelMap>): Promise<ResolvedModelItem<TModel, TModelDefaults, TModelMap>> {
  const meta: CustomHookMeta = {}

  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
  let result: ResolvedModelItem<TModel, TModelDefaults, TModelMap> | undefined

  await store.hooks.callHook('beforeMutation', {
    store,
    meta,
    model,
    mutation: 'create',
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem
    },
  })

  await store.hooks.callHook('createItem', {
    store,
    meta,
    model,
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
    mutation: 'create',
    item,
    getResult: () => result,
    setResult: (newResult) => {
      result = newResult
    },
  })

  if (result) {
    store.processItemParsing(model, result)

    if (!skipCache) {
      const key = model.getKey(result)

      if (key) {
        store.cache.writeItem({
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

  store.mutationHistory.push({
    operation: 'create',
    model,
    payload: item,
  })

  return result
}
