import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { WrappedItem } from './item'
import type { FilterArray, Full, KeysToUnion, Path, PathValue } from './utils'

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
  TItem extends Record<string, any> = Record<string, any>,
  TComputed extends Record<string, any> = Record<string, any>,
  TSchemas extends ModelSchemas = ModelSchemas,
> {
  '~type'?: 'model'

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
   *
   * It's recommended to use `defineRelations` instead.
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
       * Parse the value received from the plugins.
       */
      parse?: (value: any) => PathValue<TItem, K>

      /**
       * Serialize the value before sending it to the plugins.
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

type NonSymbol<T> = T extends symbol ? never : T

export interface ModelRelationReference<
  TModel extends Model = Model,
  TTargetModel extends Model = Model,
  TRelatedItem = NonNullable<TTargetModel['~item']>,
> {
  on: Partial<{
    [K in `${TTargetModel['name']}.${NonSymbol<keyof TTargetModel['~item']>}` | keyof TTargetModel['~item']]: `${TModel['name']}.${NonSymbol<keyof TModel['~item']>}` | keyof TModel['~item']
  }>
  filter?: (item: NonNullable<TModel['~item']>, relationItem: TRelatedItem) => boolean
}

export interface ModelRelation<
  TModel extends Model = Model,
  TRelatedItem = any,
> {
  many?: boolean
  to: Record<string, ModelRelationReference<TModel, Model, TRelatedItem>>
}

export interface ModelRelations<
  TModel extends Model = Model,
  TRelations extends Record<string, ModelRelation<TModel>> = Record<string, ModelRelation<TModel>>,
> {
  '~type': 'relation'
  'model': TModel
  'relations': TRelations
}

export type StoreSchema<TModels extends Array<Model | ModelRelations> = Array<Model | ModelRelations>> = TModels

export type ModelsFromStoreSchema<TSchema extends StoreSchema> = FilterArray<TSchema, Model>

export type ModelNameMap<TModels extends StoreSchema> = { [T in ModelsFromStoreSchema<TModels> as T['name']]: T }

export type ModelByName<TModels extends StoreSchema, TName extends string, TNameMap extends ModelNameMap<TModels> = ModelNameMap<TModels>> = TName extends keyof TNameMap ? TNameMap[TName] : never

export type RelationsFromStoreSchema<TSchema extends StoreSchema> = FilterArray<TSchema, ModelRelations>

export type RelationsNameMap<TSchema extends StoreSchema> = { [T in RelationsFromStoreSchema<TSchema> as T['model']['name']]: T['relations'] }

export type RelationsByName<TSchema extends StoreSchema, TName extends string, TNameMap extends RelationsNameMap<TSchema> = RelationsNameMap<TSchema>> = TName extends keyof TNameMap ? TNameMap[TName] : never

export interface ResolvedModel<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
  TSchema extends StoreSchema = StoreSchema,
  TSchemas extends ModelSchemas = ModelSchemas,
> {
  '~resolved': true
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

type MapToResolvedModelList<
  TModelList extends Array<Model>,
  TModelDefaults extends ModelDefaults,
> = {
  [K in keyof TModelList]: ResolvedModel<TModelList[K], TModelDefaults, TModelList>
}

export type ResolvedModelList<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults,
> = MapToResolvedModelList<Array<ModelsFromStoreSchema<TSchema>>, TModelDefaults>

export type ResolvedModelItemBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = NonNullable<ResolvedModel<TModel, TModelDefaults, TSchema>['~item']>

export type ResolvedModelItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = ResolvedModelItemBase<TModel, TModelDefaults, TSchema>
  & ResolvedRelationItems<TModel, TModelDefaults, TSchema>
  & ResolvedComputedFields<TModel, TModelDefaults, TSchema>

export type ResolvedRelationItems<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = {
  [K in keyof NonNullable<TModel['relations']>]: ResolvedRelationItemsForRelation<TModel, TModelDefaults, TSchema, NonNullable<ResolvedModel<TModel, TModelDefaults, TSchema>['relations']>[K]>
} & {
  [K in keyof NonNullable<RelationsByName<TSchema, TModel['name']>>]:
  RelationsByName<TSchema, TModel['name']> extends Record<string, ModelRelation> ? ResolvedRelationItemsForRelation<TModel, TModelDefaults, TSchema, NonNullable<RelationsByName<TSchema, TModel['name']>>[K]> : never
}

type ResolvedRelationItemsForRelation<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TRelation extends ModelRelation,
> = TRelation['many'] extends true
  ? Array<ResolvedRelationItemsForRelationTargetModels<TModel, TModelDefaults, TSchema, TRelation>>
  : ResolvedRelationItemsForRelationTargetModels<TModel, TModelDefaults, TSchema, TRelation> | undefined

type ResolvedRelationItemsForRelationTargetModels<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TRelation extends ModelRelation,
> = ModelByName<TSchema, KeysToUnion<TRelation['to']>> extends Model ? WrappedItem<ModelByName<TSchema, KeysToUnion<TRelation['to']>>, TModelDefaults, TSchema> : never

type ResolvedComputedFields<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = {
  [K in keyof NonNullable<TModelDefaults['computed'] & TModel['computed']>]: ReturnType<NonNullable<TModelDefaults['computed'] & TModel['computed']>[K]>
}

// export type ResolvedModelState<
//   TModel extends Model,
// > = ReturnType<NonNullable<TModel['state']>>
