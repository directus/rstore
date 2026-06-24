import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, ResolvedCollectionItemBase, StoreSchema } from './collection'
import type { FieldTimestamps, FieldTimestampValue } from './crdt'
import type { FormObjectBase } from './form'
import type { FormOperation } from './formOperation'
import type { GlobalStoreType } from './global'
import type { CustomHookMeta } from './hooks'
import type { Awaitable } from './utils'

export interface MutationOperation<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  operation: 'create' | 'update' | 'delete' | 'module-mutation'
  collection?: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  module?: string
  /**
   * Either the key of the item in the collection or the key of the exposed mutation in the module.
   */
  key?: string | number
  keys?: Array<string | number>
  payload?: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> | Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
}

export interface MutationSpecialProps {
  // To be extended
}

export type CollectionMutationType = 'create' | 'update' | 'delete'

export interface ApplyMutationResult {
  written: Array<string | number>
  deleted: Array<string | number>
  skipped: number
}

export interface FinalizeMutationResult<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> extends ApplyMutationResult {
  result?: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
  results?: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
}

export interface ApplyMutationOptions<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  mutation: CollectionMutationType
  key?: string | number
  keys?: Array<string | number>
  item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  items?: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | { key?: string | number, item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> }>
  result?: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
  results?: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  meta?: CustomHookMeta
  fieldTimestamps?: FieldTimestamps
  deletedAt?: FieldTimestampValue
}

export interface FinalizeMutationOptions<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> extends ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema> {
  skipCache?: boolean
  formOperations?: FormOperation[]
}

export interface MutateOptions<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> extends Omit<FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>, 'result' | 'results'> {
  many?: boolean
}

export interface MutateContext<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  store: GlobalStoreType
  meta: CustomHookMeta
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  mutation: CollectionMutationType
  key?: string | number
  keys?: Array<string | number>
  item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  items?: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | { key?: string | number, item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> }>
}

export type MutateCallback<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
  TResult = unknown,
> = (context: MutateContext<TCollection, TCollectionDefaults, TSchema>) => Awaitable<TResult>

export type CollectionMutateOptions<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> = Omit<MutateOptions<TCollection, TCollectionDefaults, TSchema>, 'collection'>

export type CollectionMutateCallback<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
  TResult = unknown,
> = MutateCallback<TCollection, TCollectionDefaults, TSchema, TResult>

export type CreateFormObjectBase<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = FormObjectBase<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>, NonNullable<NonNullable<TCollection['formSchema']>['create']>>

export type CreateFormObject<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TCollection['formSchema']>['create']>>
  & CreateFormObjectBase<TCollection, TCollectionDefaults, TSchema>
  & Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

export type UpdateFormObjectBase<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = FormObjectBase<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>, NonNullable<NonNullable<TCollection['formSchema']>['update']>>

export type UpdateFormObject<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TCollection['formSchema']>['update']>>
  & UpdateFormObjectBase<TCollection, TCollectionDefaults, TSchema>
  & Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
