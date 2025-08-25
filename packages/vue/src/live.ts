import type { FindOptions, Model, ModelDefaults, StoreCore, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'

export interface VueLiveQueryReturn<
  _TModel extends Model,
  _TModelDefaults extends ModelDefaults,
  _TModelList extends StoreSchema,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

export interface VueCreateQueryOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TModel, TModelDefaults, TSchema>,
  TResult,
> {
  store: StoreCore<TSchema, TModelDefaults>
  fetchMethod: (options?: TOptions) => Promise<TResult>
  cacheMethod: (options?: TOptions) => TResult
  defaultValue: TResult
  options?: MaybeRefOrGetter<TOptions | undefined>
}
