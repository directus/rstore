import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from '../collection'
import type { FindOptions } from '../query'
import type { Awaitable } from '../utils'
import type { CustomHookMeta } from './meta'

/**
 * Options accepted by `BatchFetchOperation.setResult`.
 */
export interface BatchFetchSetResultOptions {
  /** Optional cache marker to store alongside the item. */
  marker?: string
}

/**
 * A single fetch operation exposed to batch hooks.
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
  /** Resolve this fetch with the given item. */
  setResult: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined, options?: BatchFetchSetResultOptions) => void
  /** Reject this fetch with an error. */
  setError: (error: Error) => void
  /** `true` once this operation has been resolved. */
  readonly resolved: boolean
}

/**
 * A single mutation operation exposed to batch hooks.
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
  /** Resolve this mutation with the returned item. */
  setResult: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined) => void
  /** Reject this mutation with an error. */
  setError: (error: Error) => void
  /** `true` once this operation has been resolved. */
  readonly resolved: boolean
}

/**
 * Any batch operation in a unified batch.
 */
export type BatchOperation<
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
>
  = | BatchFetchOperation<Collection, TCollectionDefaults, TSchema>
    | BatchMutationOperation<Collection, TCollectionDefaults, TSchema>

/**
 * Batch-related hooks.
 */
export interface BatchHookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  /**
   * Unified batch hook across all collections and operation types.
   */
  batch: (
    payload: {
      store: import('../global').GlobalStoreType
      meta: CustomHookMeta
      /** Batch group name. */
      group: string
      /** All operations in this batch. */
      operations: Array<BatchOperation<TCollectionDefaults, TSchema>>
      /** Fetch-only subset of `operations`. */
      fetches: Array<BatchFetchOperation<Collection, TCollectionDefaults, TSchema>>
      /** Mutation-only subset of `operations`. */
      mutations: Array<BatchMutationOperation<Collection, TCollectionDefaults, TSchema>>
    },
  ) => Awaitable<void>

  /**
   * Called when multiple keyed `findFirst` calls for a collection are batched.
   */
  batchFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: import('../global').GlobalStoreType
      meta: CustomHookMeta
      /** Batch group name. */
      group: string
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      /** Per-operation handles with `setResult` / `setError`. */
      operations: Array<BatchFetchOperation<TCollection, TCollectionDefaults, TSchema>>
    },
  ) => Awaitable<void>

  /**
   * Called when multiple mutations of the same type/collection are batched.
   */
  batchMutate: <
    TCollection extends Collection,
  > (
    payload: {
      store: import('../global').GlobalStoreType
      meta: CustomHookMeta
      /** Batch group name. */
      group: string
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      mutation: 'create' | 'update' | 'delete'
      /** Per-operation handles with `setResult` / `setError`. */
      operations: Array<BatchMutationOperation<TCollection, TCollectionDefaults, TSchema>>
    },
  ) => Awaitable<void>
}
