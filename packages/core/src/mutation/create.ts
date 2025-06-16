import type { CustomHookMeta, Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem, StoreCore } from '@rstore/shared'
import { pickNonSpecialProps, set } from '@rstore/shared'

export interface CreateOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  item: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
  skipCache?: boolean
}

export async function createItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  model,
  item,
  skipCache,
}: CreateOptions<TModel, TModelDefaults, TModelList>): Promise<ResolvedModelItem<TModel, TModelDefaults, TModelList>> {
  const meta: CustomHookMeta = {}

  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

  store.$processItemSerialization(model, item)

  let result: ResolvedModelItem<TModel, TModelDefaults, TModelList> | undefined

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
      item = newItem
    },
  })

  await store.$hooks.callHook('createItem', {
    store,
    meta,
    model,
    item,
    getResult: () => result,
    setResult: (newResult) => {
      result = newResult
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
      result = newResult
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
