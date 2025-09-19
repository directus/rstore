import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema } from './collection'
import type { FormObjectBase } from './form'

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
