import type { CustomHookMeta, Model, ModelDefaults, ResolvedModel, StoreCore, StoreSchema } from '@rstore/shared'

export interface DeleteOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  key: string | number
  skipCache?: boolean
}

export async function deleteItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  model,
  key,
  skipCache,
}: DeleteOptions<TModel, TModelDefaults, TSchema>): Promise<void> {
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
