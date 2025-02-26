import { type Model, type ModelDefaults, type ModelType, pickNonSpecialProps, type ResolvedModelItem, type ResolvedModelType, type StoreCore } from '@rstore/shared'

export interface CreateOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults>
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
  item = pickNonSpecialProps(item) as Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  let result: ResolvedModelItem<TModelType, TModelDefaults, TModel> | undefined

  await store.hooks.callHook('createItem', {
    store,
    type,
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
