import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Model, ModelDefaults, ModelMap, ResolvedModel, ResolvedModelItem } from './model'

export interface MutationOperation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> {
  operation: 'create' | 'update' | 'delete'
  model: ResolvedModel<TModel, TModelDefaults, TModelMap>
  key?: string
  payload?: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
}

export type CreateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['schema']>['create']>> & {
  $save: () => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
  $reset: () => void
  $schema: NonNullable<NonNullable<TModel['schema']>['create']>
  $error: Error | null
  $loading: boolean
}

export type UpdateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> = StandardSchemaV1.InferInput<NonNullable<NonNullable<TModel['schema']>['update']>> & {
  $save: () => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
  $reset: () => Promise<void>
  $schema: NonNullable<NonNullable<TModel['schema']>['update']>
  $error: Error | null
  $loading: boolean
}
