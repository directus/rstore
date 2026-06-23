import type { CreateManyOptions, CreateOptions, DeleteManyOptions, DeleteOptions, UpdateManyOptions, UpdateOptions } from '@rstore/core'
import type { Collection, CollectionDefaults, CustomHookMeta, FindFirstOptions, FindManyOptions, FindOptions, HybridPromise, ResolvedCollection, ResolvedCollectionItem, ResolvedCollectionItemBase, StandardSchemaV1, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { CreateFormObjectOptions, VueCreateFormObject, VueUpdateFormObject } from '../form'
import type { VueQueryReturn } from '../query'
import type { VueStore } from '../store'

export type QueryType = 'first' | 'many'

export type QueryFirstOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema> | { enabled: false }

export type QueryManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = FindManyOptions<TCollection, TCollectionDefaults, TSchema> | { enabled: false }

export interface QueryBuilder<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /** Create a reactive query for the first item matching options. */
  first: (options: QueryFirstOptions<TCollection, TCollectionDefaults, TSchema>) => QueryFirstOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': 'first' }
  /** Create a reactive query for all items matching options. */
  many: (() => QueryManyOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': 'many' }) & ((options: QueryManyOptions<TCollection, TCollectionDefaults, TSchema>) => QueryManyOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': 'many' })
}

export interface LiveQueryBuilder<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> extends QueryBuilder<TCollection, TCollectionDefaults, TSchema> {}

export type SubscriptionQueryBuilder<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = <TOptions extends string | number | FindOptions<TCollection, TCollectionDefaults, TSchema> | undefined> (options: TOptions) => TOptions

export interface SubscribeResult {
  unsubscribe: () => Promise<void>
  meta: Ref<CustomHookMeta>
}

export type QueryResult<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TCollection, TCollectionDefaults, TSchema>,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType },
> = HybridPromise<
  TOptions extends { '~type': 'first' }
    ? VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TItem | null>
    : TOptions extends { '~type': 'many' }
      ? VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, Array<TItem>>
      : never
>

export type LiveQueryResult<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TCollection, TCollectionDefaults, TSchema>,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType },
> = QueryResult<TCollection, TCollectionDefaults, TSchema, TItem, TOptions>

export interface VueCollectionApi<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TCollection, TCollectionDefaults, TSchema>,
> {
  /** Find the first matching item in cache without fetching. */
  peekFirst: (options: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>) => WrappedItem<TCollection, TCollectionDefaults, TSchema> | null
  /** Single-shot query for the first matching item. */
  findFirst: (options: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>) => Promise<WrappedItem<TCollection, TCollectionDefaults, TSchema> | null>
  /** Find all matching items in cache without fetching. */
  peekMany: (options?: FindManyOptions<TCollection, TCollectionDefaults, TSchema> | undefined) => Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>
  /** Single-shot query for all matching items. */
  findMany: (options?: FindManyOptions<TCollection, TCollectionDefaults, TSchema> | undefined) => Promise<Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>>
  /** Create a reactive query that watches options. */
  query: <TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType }> (
    optionsGetter: (queryBuilder: QueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions,
  ) => QueryResult<TCollection, TCollectionDefaults, TSchema, TItem, TOptions>
  /** Create a reactive live query and subscribe to updates. */
  liveQuery: <TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType }> (
    optionsGetter: (queryBuilder: LiveQueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions,
  ) => LiveQueryResult<TCollection, TCollectionDefaults, TSchema, TItem, TOptions>
  /** Start a realtime subscription for an item or query. */
  subscribe: (
    optionsGetter: (queryBuilder: SubscriptionQueryBuilder<TCollection, TCollectionDefaults, TSchema>) => FindOptions<TCollection, TCollectionDefaults, TSchema>,
  ) => SubscribeResult
  /** Create an item directly. */
  create: (
    item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
    createOptions?: Pick<CreateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic' | 'formOperations' | 'batch'>,
  ) => Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  /** Create many items directly. */
  createMany: (
    items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>,
    createOptions?: Pick<CreateManyOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>,
  ) => Promise<Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
  /** Create a form for a new item. */
  createForm: (
    formOptions?: {
      defaultValues?: () => Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
      schema?: StandardSchemaV1
    } & Pick<CreateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>
    & Pick<CreateFormObjectOptions<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>, StandardSchemaV1, never>, 'resetOnSuccess' | 'validateOnSubmit' | 'transformData'>,
  ) => VueCreateFormObject<TCollection, TCollectionDefaults, TSchema>
  /** Update an item directly. */
  update: (
    item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
    updateOptions?: Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'key' | 'optimistic' | 'formOperations' | 'batch'>,
  ) => Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  /** Update many items directly. */
  updateMany: (
    items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>,
    updateOptions?: Pick<UpdateManyOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>,
  ) => Promise<Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
  /** Create a form for updating an existing item. */
  updateForm: (
    options: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>,
    formOptions?: {
      defaultValues?: () => Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
      schema?: StandardSchemaV1
      pickOnlyChanged?: boolean
    } & Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>
    & Pick<CreateFormObjectOptions<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>, StandardSchemaV1, never>, 'resetOnSuccess' | 'validateOnSubmit' | 'transformData'>,
  ) => Promise<VueUpdateFormObject<TCollection, TCollectionDefaults, TSchema>>
  /** Delete one item. */
  delete: (
    keyOrItem: string | number | Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
    DeleteOptions?: Pick<DeleteOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic' | 'batch'>,
  ) => Promise<void>
  /** Delete many items. */
  deleteMany: (
    keysOrItems: Array<string | number | Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>,
    deleteOptions?: Pick<DeleteManyOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>,
  ) => Promise<void>
  getKey: (item: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>) => string | number | null | undefined
  writeItem: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => WrappedItem<TCollection, TCollectionDefaults, TSchema>
  clearItem: (key: string | number) => void
}

export interface CreateCollectionApiOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: VueStore<TSchema, TCollectionDefaults>
  getCollection: () => ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  onInvalidate?: (cb: () => unknown) => { off: () => void }
}
