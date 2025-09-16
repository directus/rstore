import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CollectionHooks } from './collectionHooks'
import type { WrappedItem } from './item'
import type { FilterArray, Full, KeysToUnion, Path, PathValue } from './utils'

/* eslint-disable unused-imports/no-unused-vars */

export type GetKey<TItem> = (item: TItem) => string | number | undefined | null

export interface CustomCollectionMeta<
  TCollection extends Collection = Collection,
> {}

export interface CollectionSchemas<
  TCreateSchema extends StandardSchemaV1 = StandardSchemaV1,
  TUpdateSchema extends StandardSchemaV1 = StandardSchemaV1,
> {
  create?: TCreateSchema
  update?: TUpdateSchema
}

export interface Collection<
  TItem = any,
  TComputed extends Record<string, any> = Record<string, any>,
  TSchemas extends CollectionSchemas = CollectionSchemas,
> {
  '~type'?: 'collection'

  /**
   * Name of the collection.
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
   * Check if the item is an instance of the collection.
   */
  'isInstanceOf'?: (item: any) => boolean

  /**
   * Relations to other collections.
   *
   * @deprecated It's recommended to use `defineRelations` instead.
   */
  'relations'?: Record<string, CollectionRelation>

  /**
   * Computed properties for the collection.
   */
  'computed'?: {
    [K in keyof TComputed]: (item: TItem) => TComputed[K]
  }

  /**
   * Field configuration for the collection.
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
   * Allows scoping the collection to specific plugins.
   *
   * This is useful when you have multiple data sources.
   */
  'scopeId'?: string

  /**
   * Hooks to fetch or mutate data for this collection.
   */
  'hooks'?: CollectionHooks<this>

  'meta'?: CustomCollectionMeta<this>

  /**
   * @private
   */
  '~item'?: TItem
}

export type DefaultIsInstanceOf = (collection: Collection) => (item: any) => boolean

/**
 * Default values for any collection.
 */
export type CollectionDefaults = Partial<Pick<Collection, 'getKey' | 'computed' | 'fields' | 'meta'>> & {
  isInstanceOf?: DefaultIsInstanceOf
}

export type CollectionDataKeys<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
> = keyof TCollection['~item'] | keyof TCollection['computed'] | keyof TCollectionDefaults['computed']

type NonSymbol<T> = T extends symbol ? never : T

export interface CollectionRelationReference<
  TCollection extends Collection = Collection,
  TTargetCollection extends Collection = Collection,
  TRelatedItem = NonNullable<TTargetCollection['~item']>,
> {
  on: Partial<{
    [K in `${TTargetCollection['name']}.${NonSymbol<keyof TTargetCollection['~item']>}` | keyof TTargetCollection['~item']]: `${TCollection['name']}.${NonSymbol<keyof TCollection['~item']>}` | keyof TCollection['~item']
  }>
  filter?: (item: NonNullable<TCollection['~item']>, relationItem: TRelatedItem) => boolean
}

export interface CollectionRelation<
  TCollection extends Collection = Collection,
  TRelatedItem = any,
> {
  many?: boolean
  to: Record<string, CollectionRelationReference<TCollection, Collection, TRelatedItem>>
}

export interface CollectionRelations<
  TCollection extends Collection = Collection,
  TRelations extends Record<string, CollectionRelation<TCollection>> = Record<string, CollectionRelation<TCollection>>,
> {
  '~type': 'relation'
  'collection': TCollection
  'relations': TRelations
}

export type StoreSchema<TCollections extends Array<Collection | CollectionRelations> = Array<Collection | CollectionRelations>> = TCollections

export type CollectionsFromStoreSchema<TSchema extends StoreSchema> = FilterArray<TSchema, Collection>

export type CollectionNameMap<TCollections extends StoreSchema> = { [T in CollectionsFromStoreSchema<TCollections> as T['name']]: T }

export type CollectionByName<TCollections extends StoreSchema, TName extends string, TNameMap extends CollectionNameMap<TCollections> = CollectionNameMap<TCollections>> = TName extends keyof TNameMap ? TNameMap[TName] : never

export type RelationsFromStoreSchema<TSchema extends StoreSchema> = FilterArray<TSchema, CollectionRelations>

export type RelationsNameMap<TSchema extends StoreSchema> = { [T in RelationsFromStoreSchema<TSchema> as T['collection']['name']]: T['relations'] }

export type RelationsByName<TSchema extends StoreSchema, TName extends string, TNameMap extends RelationsNameMap<TSchema> = RelationsNameMap<TSchema>> = TName extends keyof TNameMap ? TNameMap[TName] : never

export interface ResolvedCollection<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
  TSchemas extends CollectionSchemas = CollectionSchemas,
> {
  '~resolved': true
  'name': string
  'getKey': NonNullable<TCollection['getKey']>
  'isInstanceOf': NonNullable<TCollection['isInstanceOf']>
  'relations': NonNullable<TCollection['relations']>
  'computed': NonNullable<TCollectionDefaults['computed'] & TCollection['computed']>
  'fields': TCollection['fields']
  'formSchema': Full<TSchemas>
  'scopeId'?: string
  // 'state': () => ResolvedCollectionState<TCollection>
  // // 'global': NonNullable<TCollection['global']>
  // // 'mutations': NonNullable<TCollection['mutations']>
  'hooks': TCollection['hooks']
  'meta'?: CustomCollectionMeta
  '~item'?: TCollection['~item']
}

type MapToResolvedCollectionList<
  TCollectionList extends Array<Collection>,
  TCollectionDefaults extends CollectionDefaults,
> = {
  [K in keyof TCollectionList]: ResolvedCollection<TCollectionList[K], TCollectionDefaults, TCollectionList>
}

export type ResolvedCollectionList<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> = MapToResolvedCollectionList<Array<CollectionsFromStoreSchema<TSchema>>, TCollectionDefaults>

export type ResolvedCollectionItemBase<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = NonNullable<ResolvedCollection<TCollection, TCollectionDefaults, TSchema>['~item']>

export type ResolvedCollectionItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
  & ResolvedRelationItems<TCollection, TCollectionDefaults, TSchema>
  & ResolvedComputedFields<TCollection, TCollectionDefaults, TSchema>

export type ResolvedRelationItems<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = {
  [K in keyof NonNullable<TCollection['relations']>]: ResolvedRelationItemsForRelation<TCollection, TCollectionDefaults, TSchema, NonNullable<ResolvedCollection<TCollection, TCollectionDefaults, TSchema>['relations']>[K]>
} & {
  [K in keyof NonNullable<RelationsByName<TSchema, TCollection['name']>>]:
  RelationsByName<TSchema, TCollection['name']> extends Record<string, CollectionRelation> ? ResolvedRelationItemsForRelation<TCollection, TCollectionDefaults, TSchema, NonNullable<RelationsByName<TSchema, TCollection['name']>>[K]> : never
}

type ResolvedRelationItemsForRelation<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TRelation extends CollectionRelation,
> = TRelation['many'] extends true
  ? Array<ResolvedRelationItemsForRelationTargetCollections<TCollection, TCollectionDefaults, TSchema, TRelation>>
  : ResolvedRelationItemsForRelationTargetCollections<TCollection, TCollectionDefaults, TSchema, TRelation> | undefined

type ResolvedRelationItemsForRelationTargetCollections<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TRelation extends CollectionRelation,
> = CollectionByName<TSchema, KeysToUnion<TRelation['to']>> extends Collection ? WrappedItem<CollectionByName<TSchema, KeysToUnion<TRelation['to']>>, TCollectionDefaults, TSchema> : never

type ResolvedComputedFields<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = {
  [K in keyof NonNullable<TCollectionDefaults['computed'] & TCollection['computed']>]: ReturnType<NonNullable<TCollectionDefaults['computed'] & TCollection['computed']>[K]>
}

// export type ResolvedCollectionState<
//   TCollection extends Collection,
// > = ReturnType<NonNullable<TCollection['state']>>
