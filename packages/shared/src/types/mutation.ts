import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem } from './model'

export interface MutationOperation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  operation: 'create' | 'update' | 'delete'
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  key?: string | number
  payload?: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
}

export interface CreateFormObjectBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  $save: () => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
  $reset: () => void
  $schema: NonNullable<NonNullable<TModel['formSchema']>['create']>
  $error: Error | null
  $loading: boolean
}

export type CreateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['formSchema']>['create']>>
  & CreateFormObjectBase<TModel, TModelDefaults, TModelList>
  & Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

export interface UpdateFormObjectBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  $save: () => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
  $reset: () => Promise<void>
  $schema: NonNullable<NonNullable<TModel['formSchema']>['update']>
  $error: Error | null
  $loading: boolean
}

export type UpdateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['formSchema']>['update']>>
  & UpdateFormObjectBase<TModel, TModelDefaults, TModelList>
  & Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
