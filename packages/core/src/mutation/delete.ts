import type { CustomHookMeta, Model, ModelDefaults, ModelList, ResolvedModel, StoreCore } from '@rstore/shared'

export interface DeleteOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  key: string | number
  skipCache?: boolean
}

export async function deleteItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  model,
  key,
  skipCache,
}: DeleteOptions<TModel, TModelDefaults, TModelList>): Promise<void> {
  const meta: CustomHookMeta = {}

  await store.$hooks.callHook('beforeMutation', {
    store,
    meta,
    model,
    mutation: 'delete',
    key,
    modifyItem: () => {},
    setItem: () => {},
  })

  await store.$hooks.callHook('deleteItem', {
    store,
    meta,
    model,
    key,
  })

  await store.$hooks.callHook('afterMutation', {
    store,
    meta,
    model,
    mutation: 'delete',
    key,
    getResult: () => undefined,
    setResult: () => {},
  })

  if (!skipCache) {
    store.$cache.deleteItem({
      model,
      key,
    })
  }

  store.$mutationHistory.push({
    operation: 'delete',
    model,
    key,
  })
}
