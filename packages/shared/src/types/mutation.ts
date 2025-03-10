import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem } from './model'

export interface MutationOperation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  operation: 'create' | 'update' | 'delete'
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  key?: string
  payload?: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
}

export type CreateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['schema']>['create']>> & {
  $save: () => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
  $reset: () => void
  $schema: NonNullable<NonNullable<TModel['schema']>['create']>
  $error: Error | null
  $loading: boolean
}

export type UpdateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['schema']>['update']>> & {
  $save: () => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
  $reset: () => Promise<void>
  $schema: NonNullable<NonNullable<TModel['schema']>['update']>
  $error: Error | null
  $loading: boolean
}
