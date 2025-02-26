import type { Model, ModelDefaults, ModelType, ResolvedModelType, StoreCore } from '@rstore/shared'

export interface DeleteOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults>
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
  await store.hooks.callHook('deleteItem', {
    store,
    type,
    key,
  })

  if (!skipCache) {
    store.cache.deleteItem({
      type,
      key,
    })
  }
}
