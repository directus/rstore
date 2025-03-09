import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { WrappedItem } from './item'
import type { Full, KeysToUnion, Path, PathValue } from './utils'

/* eslint-disable unused-imports/no-unused-vars */

export type GetKey<TItem> = (item: TItem) => string | undefined | null

export interface CustomModelMeta {}

export interface ModelSchemas<
  TCreateSchema extends StandardSchemaV1 = StandardSchemaV1,
  TUpdateSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  create?: TCreateSchema
  update?: TUpdateSchema
}

export interface Model<
  TItem = any,
  TComputed extends Record<string, any> = Record<string, any>,
  TSchemas extends ModelSchemas = ModelSchemas,
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
   * Check if the item is an instance of the model.
   */
  'isInstanceOf'?: (item: any) => boolean

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

  'meta'?: CustomModelMeta

  /**
   * @private
   */
  '~item'?: TItem
}

export type DefaultIsInstanceOf = (model: Model) => (item: any) => boolean

/**
 * Default values for any model.
 */
export type ModelDefaults = Partial<Pick<Model, 'getKey' | 'computed' | 'fields' | 'meta'>> & {
  isInstanceOf?: DefaultIsInstanceOf
}

export type ModelDataKeys<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
> = keyof TModel['~item'] | keyof TModel['computed'] | keyof TModelDefaults['computed']

export interface ModelRelation {
  many?: boolean

  to: Record<string, {
    /**
     * Field name on the current model.
     */
    on: string

    /**
     * Field name on the target model.
     */
    eq: string
  }>
}

export type ModelMap<TModelMap extends Record<string, Model> = Record<string, Model>> = TModelMap

export interface ResolvedModel<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  _TModelMap extends ModelMap,
  TSchemas extends ModelSchemas = ModelSchemas,
> {
  'name': string
  'getKey': NonNullable<TModel['getKey']>
  'isInstanceOf': NonNullable<TModel['isInstanceOf']>
  'relations': NonNullable<TModel['relations']>
  'computed': NonNullable<TModelDefaults['computed'] & TModel['computed']>
  'fields': TModel['fields']
  'schema': Full<TSchemas>
  'meta'?: CustomModelMeta
  '~item'?: TModel['~item']
}

export type ResolvedModelMap<
  TModelMap extends Record<string, Model>,
  TModelDefaults extends ModelDefaults,
> = {
  [K in keyof TModelMap]: ResolvedModel<TModelMap[K], TModelDefaults, ModelMap<TModelMap>>
}

export type ResolvedModelItemBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> = NonNullable<ResolvedModel<TModel, TModelDefaults, TModelMap>['~item']>

export type ResolvedModelItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> = ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> & ResolvedRelationItems<TModel, TModelDefaults, TModelMap> & ResolvedComputedFields<TModel, TModelDefaults, TModelMap>

export type ResolvedRelationItems<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> = {
  [K in keyof NonNullable<TModel['relations']>]: ResolvedRelationItemsForRelation<TModel, TModelDefaults, TModelMap, NonNullable<ResolvedModel<TModel, TModelDefaults, TModelMap>['relations']>[K]>
}

type ResolvedRelationItemsForRelation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
  TRelation extends ModelRelation,
> = TRelation['many'] extends true
  ? Array<ResolvedRelationItemsForRelationTargetModels<TModel, TModelDefaults, TModelMap, TRelation>>
  : ResolvedRelationItemsForRelationTargetModels<TModel, TModelDefaults, TModelMap, TRelation> | undefined

type ResolvedRelationItemsForRelationTargetModels<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
  TRelation extends ModelRelation,
> = WrappedItem<TModelMap[KeysToUnion<TRelation['to']>], TModelDefaults, TModelMap>

type ResolvedComputedFields<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> = {
  [K in keyof NonNullable<TModelDefaults['computed'] & TModel['computed']>]: ReturnType<NonNullable<TModelDefaults['computed'] & TModel['computed']>[K]>
}
