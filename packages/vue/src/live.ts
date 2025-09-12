import type { Collection, CollectionDefaults, FindOptions, StoreCore, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'

export interface VueLiveQueryReturn<
  _TCollection extends Collection,
  _TCollectionDefaults extends CollectionDefaults,
  _TCollectionList extends StoreSchema,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

export interface VueCreateQueryOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  fetchMethod: (options?: TOptions) => Promise<TResult>
  cacheMethod: (options?: TOptions) => TResult
  defaultValue: TResult
  options?: MaybeRefOrGetter<TOptions | undefined>
}
