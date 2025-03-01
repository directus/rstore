import type { Model, ModelDefaults, ModelType, ResolvedModelType, StoreCore } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'

export interface DeleteOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>
  key: string
  skipCache?: boolean
}

export async function deleteItem<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  type,
  key,
  skipCache,
}: DeleteOptions<TModelType, TModelDefaults, TModel>): Promise<void> {
  const meta: CustomHookMeta = {}

  await store.hooks.callHook('beforeMutation', {
    store,
    meta,
    type,
    mutation: 'delete',
    key,
    modifyItem: () => {},
    setItem: () => {},
  })

  await store.hooks.callHook('deleteItem', {
    store,
    meta,
    type,
    key,
  })

  await store.hooks.callHook('afterMutation', {
    store,
    meta,
    type,
    mutation: 'delete',
    key,
    getResult: () => undefined,
    setResult: () => {},
  })

  if (!skipCache) {
    store.cache.deleteItem({
      type,
      key,
    })
  }

  store.mutationHistory.push({
    operation: 'delete',
    type,
    key,
  })
}
