import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { WrappedItem } from './item'
import type { Full, KeysToUnion, Path, PathValue } from './utils'

/* eslint-disable unused-imports/no-unused-vars */

export type GetKey<TItem> = (item: TItem) => string | undefined | null

export interface CustomModelTypeMeta {}

export interface ModelTypeSchemas<
  TCreateSchema extends StandardSchemaV1 = StandardSchemaV1,
  TUpdateSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  create?: TCreateSchema
  update?: TUpdateSchema
}

export interface ModelType<
  TItem = any,
  TComputed extends Record<string, any> = Record<string, any>,
  TSchemas extends ModelTypeSchemas = ModelTypeSchemas,
> {
  /**
   * Name of the model.
   *
   * @example "User"
   */
  'name': string

  /**
   * Compute the key of the item. By default it returns the `key` or `_key` field.
   * @param item The item to compute the key from
   * @returns The unique data key of the item
   *
   * @example
   *
   * ```ts
   * getKey: (item) => [item.postKey, item.authorKey].join(':')
   * ```
   */
  'getKey'?: GetKey<TItem>

  /**
   * Relations to other models.
   */
  'relations'?: Record<string, ModelRelation>

  /**
   * Computed properties for the model.
   */
  'computed'?: {
    [K in keyof TComputed]: (item: TItem) => TComputed[K]
  }

  /**
   * Field configuration for the model.
   */
  'fields'?: {
    [K in Path<TItem>]: {
      /**
       * Parse the value received from the adapters.
       */
      parse?: (value: any) => PathValue<TItem, K>

      /**
       * Serialize the value before sending it to the adapters.
       */
      serialize?: (value: PathValue<TItem, K>) => any
    }
  }

  'schema'?: TSchemas

  'meta'?: CustomModelTypeMeta

  /**
   * @private
   */
  '~item'?: TItem
}

/**
 * Default values for any model.
 */
export type ModelDefaults = Partial<Pick<ModelType, 'getKey' | 'computed' | 'fields' | 'meta'>>

export type ModelTypeDataKeys<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
> = keyof TModelType['~item'] | keyof TModelType['computed'] | keyof TModelDefaults['computed']

export interface ModelRelation {
  many?: boolean

  to: Record<string, {
    /**
     * Field name on the current model type.
     */
    on: string

    /**
     * Field name on the target model type.
     */
    eq: string
  }>
}

export type Model<TModelTypes extends Record<string, ModelType> = Record<string, ModelType>> = TModelTypes

export interface ResolvedModelType<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  _TModel extends Model,
  TSchemas extends ModelTypeSchemas = ModelTypeSchemas,
> {
  'name': string
  'getKey': NonNullable<TModelType['getKey']>
  'relations': NonNullable<TModelType['relations']>
  'computed': NonNullable<TModelDefaults['computed'] & TModelType['computed']>
  'fields': TModelType['fields']
  'schema': Full<TSchemas>
  'meta'?: CustomModelTypeMeta
  '~item'?: TModelType['~item']
}

export type ResolvedModel<
  TModelTypes extends Record<string, ModelType>,
  TModelDefaults extends ModelDefaults,
> = {
  [K in keyof TModelTypes]: ResolvedModelType<TModelTypes[K], TModelDefaults, Model<TModelTypes>>
}

export type ResolvedModelItemBase<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> = NonNullable<ResolvedModelType<TModelType, TModelDefaults, TModel>['~item']>

export type ResolvedModelItem<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> = ResolvedModelItemBase<TModelType, TModelDefaults, TModel> & ResolvedRelationItems<TModelType, TModelDefaults, TModel> & ResolvedComputedFields<TModelType, TModelDefaults, TModel>

export type ResolvedRelationItems<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> = {
  [K in keyof NonNullable<TModelType['relations']>]: ResolvedRelationItemsForRelation<TModelType, TModelDefaults, TModel, NonNullable<ResolvedModelType<TModelType, TModelDefaults, TModel>['relations']>[K]>
}

type ResolvedRelationItemsForRelation<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
  TRelation extends ModelRelation,
> = TRelation['many'] extends true
  ? Array<ResolvedRelationItemsForRelationTargetModels<TModelType, TModelDefaults, TModel, TRelation>>
  : ResolvedRelationItemsForRelationTargetModels<TModelType, TModelDefaults, TModel, TRelation> | undefined

type ResolvedRelationItemsForRelationTargetModels<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
  TRelation extends ModelRelation,
> = WrappedItem<TModel[KeysToUnion<TRelation['to']>], TModelDefaults, TModel>

type ResolvedComputedFields<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> = {
  [K in keyof NonNullable<TModelDefaults['computed'] & TModelType['computed']>]: ReturnType<NonNullable<TModelDefaults['computed'] & TModelType['computed']>[K]>
}
