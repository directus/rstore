import type { CustomHookMeta, FindOptions, Model, ModelDefaults, ResolvedModel, StoreCore, StoreSchema } from '@rstore/shared'

export interface SubscribeOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  subscriptionId: string
  key?: string | number
  findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
  meta?: CustomHookMeta
}

export async function subscribe<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  model,
  subscriptionId,
  key,
  findOptions,
  meta,
}: SubscribeOptions<TModel, TModelDefaults, TSchema>): Promise<void> {
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
