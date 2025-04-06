import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { FormObjectBase } from './form'
import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem } from './model'

export interface MutationOperation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  operation: 'create' | 'update' | 'delete' | 'module-mutation'
  model?: ResolvedModel<TModel, TModelDefaults, TModelList>
  module?: string
  /**
   * Either the key of the item in the model or the key of the exposed mutation in the module.
   */
  key?: string | number
  payload?: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
}

export interface MutationSpecialProps {
  // To be extended
}

export type CreateFormObjectBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = FormObjectBase<ResolvedModelItem<TModel, TModelDefaults, TModelList>, NonNullable<NonNullable<TModel['formSchema']>['create']>>

export type CreateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['formSchema']>['create']>>
  & CreateFormObjectBase<TModel, TModelDefaults, TModelList>
  & Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

export type UpdateFormObjectBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = FormObjectBase<ResolvedModelItem<TModel, TModelDefaults, TModelList>, NonNullable<NonNullable<TModel['formSchema']>['update']>>

export type UpdateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['formSchema']>['update']>>
  & UpdateFormObjectBase<TModel, TModelDefaults, TModelList>
  & Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
