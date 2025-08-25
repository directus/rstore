import type { CustomHookMeta, FindOptions, Model, ModelDefaults, ResolvedModel, StoreCore, StoreSchema } from '@rstore/shared'

export interface UnsubscribeOptions<
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

export async function unsubscribe<
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
}: UnsubscribeOptions<TModel, TModelDefaults, TSchema>): Promise<void> {
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
