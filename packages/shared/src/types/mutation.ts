import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Model, ModelDefaults, ModelType, ResolvedModelItem, ResolvedModelType } from './model'

export interface MutationOperation<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  operation: 'create' | 'update' | 'delete'
  type: ResolvedModelType<TModelType, TModelDefaults>
  key?: string
  payload?: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
}

export type CreateFormObject<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModelType['schema']>['create']>> & {
  $save: () => Promise<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  $reset: () => void
  $schema: NonNullable<NonNullable<TModelType['schema']>['create']>
  $error: Error | null
  $loading: boolean
}

export type UpdateFormObject<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModelType['schema']>['update']>> & {
  $save: () => Promise<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  $reset: () => Promise<void>
  $schema: NonNullable<NonNullable<TModelType['schema']>['update']>
  $error: Error | null
  $loading: boolean
}
