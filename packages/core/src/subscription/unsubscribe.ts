import type { CustomHookMeta, FindOptions, Model, ModelDefaults, ModelList, ResolvedModel, StoreCore } from '@rstore/shared'

export interface UnsubscribeOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  subscriptionId: string
  key?: string | number
  findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
  meta?: CustomHookMeta
}

export async function unsubscribe<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  model,
  subscriptionId,
  key,
  findOptions,
  meta,
}: UnsubscribeOptions<TModel, TModelDefaults, TModelList>): Promise<void> {
  meta ??= {}

  await store.$hooks.callHook('unsubscribe', {
    store,
    meta,
    model,
    subscriptionId,
    key,
    findOptions,
  })
}
