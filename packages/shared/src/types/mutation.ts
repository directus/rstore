import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { FormObjectBase } from './form'
import type { Model, ModelDefaults, ResolvedModel, ResolvedModelItem, StoreSchema } from './model'

export interface MutationOperation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  operation: 'create' | 'update' | 'delete' | 'module-mutation'
  model?: ResolvedModel<TModel, TModelDefaults, TSchema>
  module?: string
  /**
   * Either the key of the item in the model or the key of the exposed mutation in the module.
   */
  key?: string | number
  payload?: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
}

export interface MutationSpecialProps {
  // To be extended
}

export type CreateFormObjectBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = FormObjectBase<ResolvedModelItem<TModel, TModelDefaults, TSchema>, NonNullable<NonNullable<TModel['formSchema']>['create']>>

export type CreateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['formSchema']>['create']>>
  & CreateFormObjectBase<TModel, TModelDefaults, TSchema>
  & Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

export type UpdateFormObjectBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = FormObjectBase<ResolvedModelItem<TModel, TModelDefaults, TSchema>, NonNullable<NonNullable<TModel['formSchema']>['update']>>

export type UpdateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['formSchema']>['update']>>
  & UpdateFormObjectBase<TModel, TModelDefaults, TSchema>
  & Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>
