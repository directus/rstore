import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, HybridPromise, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter, Raw, Ref, ShallowRef } from 'vue'
import type { VueStore } from '../store'

/**
 * State of one fetch lane of a query: `foreground` for blocking fetches, `background` for the
 * silent `cache-and-fetch` revalidation.
 */
export interface VueQueryFetchState {
  /** Whether at least one fetch of this lane is currently in flight. */
  loading: Ref<boolean>
  /** Error of the latest settled fetch of this lane. */
  error: Ref<Error | null>
  /** Whether a fetch of this lane settled and none is in flight. */
  completed: Ref<boolean>
  /** Epoch milliseconds of the last successful fetch of this lane. */
  lastUpdated: Ref<number | null>
  /** Promise settling when the in-flight fetches of this lane are done. Never rejects - read `error` instead. */
  readonly promise: Promise<void>
}

/** Same as {@link VueQueryFetchState}, scoped to a single page and using plain reactive values. */
export interface VueQueryPageFetchState {
  readonly loading: boolean
  readonly error: Error | null
  readonly completed: boolean
  readonly lastUpdated: number | null
  readonly promise: Promise<void>
}

/**
 * Mutable bookkeeping of a single fetch lane. One controller exists per lane per query and per
 * lane per page; both {@link VueQueryFetchState} and {@link VueQueryPageFetchState} are views over it.
 */
export interface FetchStateController {
  /** Number of fetches of this lane currently in flight. `loading` is derived from it. */
  count: ShallowRef<number>
  error: ShallowRef<Error | null>
  completed: ShallowRef<boolean>
  lastUpdated: ShallowRef<number | null>
  /** Promise settling when every in-flight fetch of this lane is done. Never rejects. */
  promise: ShallowRef<Promise<void>>
  /** Mark a fetch of this lane as started. */
  start: () => void
  /** Mark a fetch of this lane as settled. `current` is false for superseded requests. */
  settle: (options: { error?: Error | null, current: boolean }) => void
  /** Clear the lane error without starting a fetch. */
  clearError: () => void
  /** Reset `completed` without starting a fetch. */
  markIncomplete: () => void
}

export interface VueQueryReturn<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  data: Ref<TResult>
  /** Whether the user is waiting on data: a blocking fetch is running, or a background fetch is running and there is nothing to display. */
  loading: Ref<boolean>
  /** Last encountered error during query fetching, the foreground one taking precedence. */
  error: Ref<Error | null>
  /** State of blocking fetches: initial load, `refresh()` and `fetchMore()`. */
  foreground: VueQueryFetchState
  /** State of the silent `cache-and-fetch` revalidation fetches. */
  background: VueQueryFetchState
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
  /** Whether the page has nothing to display and something is being fetched for it. */
  readonly loading: boolean
  /** Whether the latest page fetch completed. Alias of `foreground.completed`. */
  readonly completed: boolean
  /** Latest page error, the foreground one taking precedence. */
  readonly error: Error | null
  /** State of blocking fetches for this page. */
  foreground: VueQueryPageFetchState
  /** State of the silent revalidation fetches for this page. */
  background: VueQueryPageFetchState
  /** @private */
  _foreground: FetchStateController
  /** @private */
  _background: FetchStateController
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
