import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { WrappedItem } from './item'
import type { Full, KeysToUnion, Path, PathValue } from './utils'

/* eslint-disable unused-imports/no-unused-vars */

export type GetKey<TItem> = (item: TItem) => string | number | undefined | null

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
    [K in Path<TItem>]?: {
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

  'formSchema'?: TSchemas

  /**
   * Allows scoping the model to specific plugins.
   *
   * This is useful when you have multiple data sources.
   */
  'scopeId'?: string

  'state'?: () => Record<string, any>

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

export type ModelList<TModels extends Array<Model> = Array<Model>> = TModels

export type ModelNameMap<TModels extends ModelList> = {
  [M in TModels[number] as M['name']]: M
}

export type ModelByName<TModels extends ModelList, TName extends string, TNameMap extends ModelNameMap<TModels> = ModelNameMap<TModels>> = TName extends keyof TNameMap ? TNameMap[TName] : never

export interface ResolvedModel<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
  TSchemas extends ModelSchemas = ModelSchemas,
> {
  'name': string
  'getKey': NonNullable<TModel['getKey']>
  'isInstanceOf': NonNullable<TModel['isInstanceOf']>
  'relations': NonNullable<TModel['relations']>
  'computed': NonNullable<TModelDefaults['computed'] & TModel['computed']>
  'fields': TModel['fields']
  'formSchema': Full<TSchemas>
  'scopeId'?: string
  // 'state': () => ResolvedModelState<TModel>
  // // 'global': NonNullable<TModel['global']>
  // // 'mutations': NonNullable<TModel['mutations']>
  'meta'?: CustomModelMeta
  '~item'?: TModel['~item']
}

export type ResolvedModelList<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
> = {
  [K in keyof TModelList]: ResolvedModel<TModelList[K], TModelDefaults, TModelList>
}

export type ResolvedModelItemBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = NonNullable<ResolvedModel<TModel, TModelDefaults, TModelList>['~item']>

export type ResolvedModelItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = ResolvedModelItemBase<TModel, TModelDefaults, TModelList>
  & ResolvedRelationItems<TModel, TModelDefaults, TModelList>
  & ResolvedComputedFields<TModel, TModelDefaults, TModelList>

export type ResolvedRelationItems<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = {
  [K in keyof NonNullable<TModel['relations']>]: ResolvedRelationItemsForRelation<TModel, TModelDefaults, TModelList, NonNullable<ResolvedModel<TModel, TModelDefaults, TModelList>['relations']>[K]>
}

type ResolvedRelationItemsForRelation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
  TRelation extends ModelRelation,
> = TRelation['many'] extends true
  ? Array<ResolvedRelationItemsForRelationTargetModels<TModel, TModelDefaults, TModelList, TRelation>>
  : ResolvedRelationItemsForRelationTargetModels<TModel, TModelDefaults, TModelList, TRelation> | undefined

type ResolvedRelationItemsForRelationTargetModels<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
  TRelation extends ModelRelation,
> = ModelByName<TModelList, KeysToUnion<TRelation['to']>> extends Model ? WrappedItem<ModelByName<TModelList, KeysToUnion<TRelation['to']>>, TModelDefaults, TModelList> : never

type ResolvedComputedFields<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = {
  [K in keyof NonNullable<TModelDefaults['computed'] & TModel['computed']>]: ReturnType<NonNullable<TModelDefaults['computed'] & TModel['computed']>[K]>
}

// export type ResolvedModelState<
//   TModel extends Model,
// > = ReturnType<NonNullable<TModel['state']>>
