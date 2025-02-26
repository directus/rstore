import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Full, Path, PathValue } from './utils'

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
  'relations'?: Array<ModelRelation>

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

export interface ModelRelation {
  /**
   * Name of the relation.
   * This relation will be available on the model as `name`.
   */
  name: string

  /**
   * Type of the relation.
   *
   * `one` means that the current model has a single reference to the target model.
   *
   * `many` means that the current model has multiple references to the target model.
   */
  type: 'one' | 'many'

  /**
   * Name of the target model.
   */
  model: string

  /**
   * Field name on the current model.
   */
  field?: string

  /**
   * Field name on the target model.
   */
  reference?: string
}

export type Model<TModelTypes extends Record<string, ModelType> = Record<string, ModelType>> = TModelTypes

export interface ResolvedModelType<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TSchemas extends ModelTypeSchemas = ModelTypeSchemas,
> {
  'name': string
  'getKey': NonNullable<TModelType['getKey']>
  'relations': Array<ResolvedModelRelation>
  'computed': NonNullable<TModelDefaults['computed'] & TModelType['computed']>
  'fields': TModelType['fields']
  'schema': Full<TSchemas>
  'meta'?: CustomModelTypeMeta
  '~item'?: TModelType['~item']
}

export interface ResolvedModelRelation {
  name: string
  type: 'one' | 'many'
  model: string
  field: string
  reference: string
}

export type ResolvedModel<
  TModelTypes extends Record<string, ModelType>,
  TModelDefaults extends ModelDefaults,
> = {
  [K in keyof TModelTypes]: ResolvedModelType<TModelTypes[K], TModelDefaults>
}

// @TODO relation fields

export type ResolvedModelItem<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  _TModel extends Model,
> = NonNullable<ResolvedModelType<TModelType, TModelDefaults>['~item']>
