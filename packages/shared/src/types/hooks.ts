import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from './collection'
import type { FieldConflict } from './crdt'
import type { FormOperation } from './formOperation'
import type { GlobalStoreType } from './global'
import type { CacheLayer } from './layer'
import type { ResolvedModule } from './module'
import type { FindFirstOptions, FindManyOptions, FindOptions } from './query'
import type { Awaitable, Path, PathValue } from './utils'

/**
 * Options accepted by `BatchFetchOperation.setResult`.
 */
export interface BatchFetchSetResultOptions {
  /** Optional cache marker to store alongside the item. */
  marker?: string
}

/**
 * A single fetch operation exposed to batch hooks.
 *
 * Hooks set the result of a specific op with `setResult(item)` / `setError(err)`.
 * Unresolved operations fall through to the next hook tier (per-collection, then individual).
 */
export interface BatchFetchOperation<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  readonly type: 'fetchFirst'
  readonly collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  readonly key: string | number
  readonly findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema>
  readonly meta: CustomHookMeta
  /** Resolve this fetch with the given item (or `undefined` if no row was returned). */
  setResult: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined, options?: BatchFetchSetResultOptions) => void
  /** Reject this fetch with an error. Does not affect sibling operations. */
  setError: (error: Error) => void
  /** `true` once `setResult` or `setError` has been called on this op. */
  readonly resolved: boolean
}

/**
 * A single mutation operation exposed to batch hooks.
 *
 * Hooks set the result of a specific op with `setResult(item)` / `setError(err)`.
 * For delete operations, `setResult(undefined)` marks the op as handled.
 * Unresolved operations fall through to the next hook tier.
 */
export interface BatchMutationOperation<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  readonly type: 'create' | 'update' | 'delete'
  readonly collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  readonly key?: string | number
  readonly item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  readonly meta: CustomHookMeta
  /** Resolve this mutation with the returned item (or `undefined` for deletes). */
  setResult: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined) => void
  /** Reject this mutation with an error. Does not affect sibling operations. */
  setError: (error: Error) => void
  /** `true` once `setResult` or `setError` has been called on this op. */
  readonly resolved: boolean
}

/**
 * Any batch operation (fetch or mutation) in a unified batch.
 */
export type BatchOperation<
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
>
  = | BatchFetchOperation<Collection, TCollectionDefaults, TSchema>
    | BatchMutationOperation<Collection, TCollectionDefaults, TSchema>

export interface HookMetaQueryTracking {
  items: Record<string, Set<string | number>>
  skipped?: boolean
}

// @TODO type generics
export interface CustomHookMeta {
  $queryTracking?: HookMetaQueryTracking
}

export interface AbortableOptions {
  /**
   * If true, the remaining hooks in the queue will not be called.
   * @default true
   */
  abort?: boolean
}

export interface HookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  init: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
    },
  ) => Awaitable<void>

  resolveFindOptions: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    } & ({
      many: true
      findOptions?: FindManyOptions<TCollection, TCollectionDefaults, TSchema>
      updateFindOptions: (findOptions: FindManyOptions<TCollection, TCollectionDefaults, TSchema>) => void
    } | {
      many: false
      findOptions?: FindFirstOptions<TCollection, TCollectionDefaults, TSchema>
      updateFindOptions: (findOptions: FindFirstOptions<TCollection, TCollectionDefaults, TSchema>) => void
    }),
  ) => void

  beforeFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      many: boolean
      updateFindOptions: (findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema>) => void
    },
  ) => Awaitable<void>

  afterFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      many: boolean
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
    },
  ) => Awaitable<void>

  /**
   * Called when the store needs to fetch an item.
   */
  fetchFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined, options?: AbortableOptions) => void
      setMarker: (marker: string | undefined) => void
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
    },
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      setMarker: (marker: string | undefined) => void
    },
  ) => void

  /**
   * Called when the store needs find an item in the cache.
   */
  cacheFilterFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined) => void
      readItemsFromCache: (options?: ReadItemsFromCacheOptions<TCollection, TCollectionDefaults, TSchema>) => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    },
  ) => void

  /**
   * Called when the store needs to fetch many items.
   */
  fetchMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>, options?: AbortableOptions) => void
      setMarker: (marker: string | undefined) => void
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
    },
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      setMarker: (marker: string | undefined) => void
      setFilter: (filter: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => boolean) => void
    },
  ) => void

  /**
   * Called when the store needs to find many items in the cache.
   */
  cacheFilterMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
    },
  ) => void

  fetchRelations: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema> & { include: NonNullable<FindOptions<TCollection, TCollectionDefaults, TSchema>['include']> }
      many: boolean
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is fetched by plugins.
   */
  parseItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      modifyItem: <TItem extends ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    },
  ) => void

  serializeItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      modifyItem: <TItem extends Record<string, any>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    },
  ) => void

  beforeMutation: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      modifyItem: <TItem extends ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
      setItem: (item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
      mutation: 'create' | 'update' | 'delete'
      /**
       * Form operations (op log) from a form submission. Only present when the mutation
       * originates from a form object (`createForm` or `updateForm`).
       *
       * Plugins can use this to handle relational edits such as connect/disconnect
       * operations on relation fields (e.g. updating junction tables, managing foreign keys).
       */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  afterMutation: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
      /**
       * Form operations (op log) from a form submission. Only present when the mutation
       * originates from a form object (`createForm` or `updateForm`).
       *
       * Plugins can use this to handle relational edits such as connect/disconnect
       * operations on relation fields (e.g. updating junction tables, managing foreign keys).
       */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  beforeManyMutation: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      keys?: Array<string | number>
      items?: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>
      setItems: (item: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>) => void
      mutation: 'create' | 'update' | 'delete'
    },
  ) => Awaitable<void>

  afterManyMutation: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      keys?: Array<string | number>
      items?: Array<{ key?: number | string, item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> }>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, options?: AbortableOptions) => void
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
      /**
       * Form operations (op log) from a form submission. Only present when the mutation
       * originates from a form object (`createForm` or `updateForm`).
       *
       * Plugins can use this to handle relational edits such as connect/disconnect
       * operations on relation fields (e.g. updating junction tables, managing foreign keys).
       */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      items: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>, options?: AbortableOptions) => void
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, options?: AbortableOptions) => void
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
      /**
       * Form operations (op log) from a form submission. Only present when the mutation
       * originates from a form object (`createForm` or `updateForm`).
       *
       * Plugins can use this to handle relational edits such as connect/disconnect
       * operations on relation fields (e.g. updating junction tables, managing foreign keys).
       */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      items: Array<{ key: number | string, item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> }>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | undefined
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>, options?: AbortableOptions) => void
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      keys: Array<string | number>
      /**
       * Don't call the remaining hooks in the queue.
       */
      abort: () => void
    },
  ) => Awaitable<void>

  afterCacheWrite: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      result?: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      marker?: string
      operation: 'write' | 'delete'
    },
  ) => void

  /**
   * Called when a CRDT field-level merge detects conflicts
   * (two concurrent modifications to the same field with the same timestamp).
   */
  cacheConflict: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      conflicts: FieldConflict[]
    },
  ) => void

  afterCacheReset: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
    },
  ) => void

  subscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      /**
       * The subscription ID is used to identify the subscription for unsubscribing.
       */
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
    },
  ) => Awaitable<void>

  unsubscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
    },
  ) => Awaitable<void>

  moduleResolved: (
    payload: {
      store: GlobalStoreType
      module: ResolvedModule<any, any>
    },
  ) => Awaitable<void>

  itemGarbageCollect: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
    },
  ) => Awaitable<void>

  cacheLayerAdd: (
    payload: {
      store: GlobalStoreType
      layer: CacheLayer
    },
  ) => Awaitable<void>

  cacheLayerRemove: (
    payload: {
      store: GlobalStoreType
      layer: CacheLayer
    },
  ) => Awaitable<void>

  sync: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      /**
       * Update sync progress
       */
      setProgress: (info: { percent: number, message?: string }) => void
      /**
       * Mark a collection as loaded and ready to be used from local storage.
       */
      setCollectionLoaded: (collectionName: string) => void
      /**
       * Mark a collection as successfully synced with remote.
       */
      setCollectionSynced: (collectionName: string) => void
    },
  ) => Awaitable<void>

  syncCollection: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<Collection, CollectionDefaults, TSchema>
      /**
       * Date of the last successful sync operation for the collection.
       */
      lastUpdatedAt?: Date
      /**
       * Items that were loaded from the local storage.
       */
      loadedItems: () => Array<ResolvedCollectionItemBase<Collection, CollectionDefaults, TSchema>>
      /**
       * Set the result items fetched from remote that should be saved in the local storage.
       */
      storeItems: (items: Array<ResolvedCollectionItemBase<Collection, CollectionDefaults, TSchema>>) => void
      /**
       * Delete items from the collection if they no longer exist on remote.
       */
      deleteItems: (keys: Array<string | number>) => void
    },
  ) => Awaitable<void>

  /**
   * Unified batch hook. Called first with ALL collected operations across all collections.
   * Allows a plugin to combine fetches and mutations into a single HTTP request (e.g. GraphQL).
   *
   * Each operation exposes its own `setResult` / `setError`. Call them in any order.
   * Any operations the hook does **not** resolve automatically fall through to the next
   * hook tier (per-collection `batchFetch` / `batchMutate`, then individual hooks), so
   * plugins can selectively handle just the ops they own without blocking the rest.
   */
  batch: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      /**
       * Name of the batch group these entries were enqueued in.
       * Useful for per-tenant / per-endpoint routing.
       * Defaults to `'default'` when callers didn't specify a group.
       */
      group: string
      /** All operations in this batch — fetches and mutations mixed together. */
      operations: Array<BatchOperation<TCollectionDefaults, TSchema>>
      /** Convenience: fetch-only subset of `operations`. */
      fetches: Array<BatchFetchOperation<Collection, TCollectionDefaults, TSchema>>
      /** Convenience: mutation-only subset of `operations`. */
      mutations: Array<BatchMutationOperation<Collection, TCollectionDefaults, TSchema>>
    },
  ) => Awaitable<void>

  /**
   * Called when multiple `findFirst` calls (by key) for the same collection are batched.
   * Called for operations not already resolved by the unified `batch` hook.
   *
   * Each operation exposes its own `setResult` / `setError`. Unresolved operations
   * fall through to the individual `fetchFirst` hook.
   */
  batchFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      /**
       * Name of the batch group these entries were enqueued in.
       * Useful for per-tenant / per-endpoint routing.
       * Defaults to `'default'` when callers didn't specify a group.
       */
      group: string
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      /** Per-operation handles with `setResult` / `setError`. */
      operations: Array<BatchFetchOperation<TCollection, TCollectionDefaults, TSchema>>
    },
  ) => Awaitable<void>

  /**
   * Called when multiple individual mutations of the same type on the same collection are batched.
   * Called for operations not already resolved by the unified `batch` hook.
   *
   * Each operation exposes its own `setResult` / `setError`. Unresolved operations
   * fall through to the individual `createItem` / `updateItem` / `deleteItem` hook.
   */
  batchMutate: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      /**
       * Name of the batch group these entries were enqueued in.
       * Useful for per-tenant / per-endpoint routing.
       * Defaults to `'default'` when callers didn't specify a group.
       */
      group: string
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      mutation: 'create' | 'update' | 'delete'
      /** Per-operation handles with `setResult` / `setError`. */
      operations: Array<BatchMutationOperation<TCollection, TCollectionDefaults, TSchema>>
    },
  ) => Awaitable<void>
}

export type HookPayload = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>[keyof HookDefinitions<StoreSchema, CollectionDefaults>]>[0]

export interface ReadItemsFromCacheOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TCollectionList extends StoreSchema,
> {
  applyFilter?: boolean | ((item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TCollectionList>) => boolean)
}
