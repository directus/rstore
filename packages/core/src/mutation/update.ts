import { type Model, type ModelDefaults, type ModelType, pickNonSpecialProps, type ResolvedModelItem, type ResolvedModelType, type StoreCore } from '@rstore/shared'
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
  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  key = key ?? type.getKey(item)

  if (!key) {
    throw new Error('Item update failed: key is not defined')
  }

  let result: ResolvedModelItem<TModelType, TModelDefaults, TModel> | null = peekFirst({
    store,
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
    type,
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
