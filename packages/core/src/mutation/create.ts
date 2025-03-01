import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { type Model, type ModelDefaults, type ModelType, pickNonSpecialProps, type ResolvedModelItem, type ResolvedModelType, set, type StoreCore } from '@rstore/shared'

export interface CreateOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>
  item: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  skipCache?: boolean
}

export async function createItem<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  type,
  item,
  skipCache,
}: CreateOptions<TModelType, TModelDefaults, TModel>): Promise<ResolvedModelItem<TModelType, TModelDefaults, TModel>> {
  const meta: CustomHookMeta = {}

  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  let result: ResolvedModelItem<TModelType, TModelDefaults, TModel> | undefined

  await store.hooks.callHook('beforeMutation', {
    store,
    meta,
    type,
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
    type,
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
    mutation: 'create',
    item,
    getResult: () => result,
    setResult: (newResult) => {
      result = newResult
    },
  })

  if (result) {
    store.processItemParsing(type, result)

    if (!skipCache) {
      const key = type.getKey(result)

      if (key) {
        store.cache.writeItem({
          type,
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
    type,
    payload: item,
  })

  return result
}
