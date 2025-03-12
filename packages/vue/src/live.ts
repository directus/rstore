import type { FindOptions, Model, ModelDefaults, ModelList, StoreCore } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'

export interface VueLiveQueryReturn<
  _TModel extends Model,
  _TModelDefaults extends ModelDefaults,
  _TModelList extends ModelList,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

export interface VueCreateQueryOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
  TOptions extends FindOptions<TModel, TModelDefaults, TModelList>,
  TResult,
> {
  store: StoreCore<TModelList, TModelDefaults>
  fetchMethod: (options?: TOptions) => Promise<TResult>
  cacheMethod: (options?: TOptions) => TResult
  defaultValue: TResult
  options?: MaybeRefOrGetter<TOptions | undefined>
}
