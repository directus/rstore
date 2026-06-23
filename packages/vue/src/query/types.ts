import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, HybridPromise, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter, Raw, Ref } from 'vue'
import type { VueStore } from '../store'

export interface VueQueryReturn<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  data: Ref<TResult>
  /** Whether the query is currently loading data. */
  loading: Ref<boolean>
  /** Last encountered error during query fetching. */
  error: Ref<Error | null>
  /** Force refreshing the query. */
  refresh: () => HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
  /** Sparse array of pages of the query. */
  pages: Ref<Array<VueQueryPage<TCollection, TCollectionDefaults, TSchema, any, TResult> | undefined>>
  /** Main page of the query. */
  mainPage: VueQueryPage<TCollection, TCollectionDefaults, TSchema, any, TResult>
  /** Create a new page and fetch it. */
  fetchMore: (optionsExtension: Partial<TOptions>) => HybridPromise<{ page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, any, TResult> }>
  /** Get a page or create a new one if missing. */
  getPage: (optionsExtension: Partial<TOptions>) => VueQueryPage<TCollection, TCollectionDefaults, TSchema, any, TResult>
  meta: Ref<CustomHookMeta>
  /** @private */
  _result: Ref<TResult>
}

export interface VueCreateQueryOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  store: VueStore<TSchema, TCollectionDefaults>
  fetchMethod: (options: TOptions | undefined, meta: CustomHookMeta) => Promise<TResult>
  cacheMethod: (options: TOptions | undefined, meta: CustomHookMeta) => TResult
  defaultValue: MaybeRefOrGetter<TResult>
  id: () => string
  getCollection: () => ResolvedCollection
  options?: MaybeRefOrGetter<TOptions | undefined | { enabled: boolean }>
  many: boolean
}

export type VueQueryPageOptions<TOptions> = Partial<Omit<TOptions, 'pageSize'>>

export interface VueQueryPage<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  id: string
  /** Used to abort ongoing fetches when a new fetch starts for the same page. */
  requestId: string
  /** Whether the page is the main page. */
  main: boolean
  index: number
  loading: boolean
  /** Whether the latest page fetch completed. */
  completed: boolean
  error: Error | null
  options: VueQueryPageOptions<TOptions>
  rawData: VueQueryRawData<TResult>
  data: TResult
}

export type VueQueryRawData<TResult>
  = | { type: 'computed' }
    | { type: 'ref', key: string | number }
    | { type: 'refs', keys: Array<string | number> }
    | { type: 'data', value: TResult }

export type VueQueryPages<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> = Ref<Array<Raw<VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>> | undefined>>
