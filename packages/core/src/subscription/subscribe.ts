import type { CustomHookMeta, FindOptions, Model, ModelDefaults, ModelList, ResolvedModel, StoreCore } from '@rstore/shared'

export interface SubscribeOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  subscriptionId: string
  key?: string
  findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
  meta?: CustomHookMeta
}

export async function subscribe<
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
}: SubscribeOptions<TModel, TModelDefaults, TModelList>): Promise<void> {
  meta ??= {}

  await store.$hooks.callHook('subscribe', {
    store,
    meta,
    model,
    subscriptionId,
    key,
    findOptions,
  })
}
