/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelByName, ModelDefaults, ModelRelation, RelationsByName, ResolvedModelItem, StoreSchema } from './model'

export interface CustomParams<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {}

export interface CustomFilterOption<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {}

export interface CustomSortOption<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {}

export interface FindOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> extends FindOptionsBase<TModel, TModelDefaults, TSchema> {}

/**
 * Fetch policy for the query.
 *
 * `cache-first` means that the query will first try to fetch the data from the cache. If the data is not found in the cache, it will fetch the data from the adapter plugins.
 *
 * `cache-and-fetch` means that the query will first try to fetch the data from the cache. It will then fetch the data from the adapter plugins and update the cache.
 *
 * `fetch-only` means that the query will only fetch the data from the adapter plugins.
 * The data will stored in the cache when the query is resolved.
 *
 * `cache-only` means that the query will only fetch the data from the cache.
 *
 * `no-cache` means that the query will not use the cache and only fetch the data from the adapter plugins. No data will be stored in the cache.
 */
export type FetchPolicy = 'cache-first' | 'cache-and-fetch' | 'fetch-only' | 'cache-only' | 'no-cache'

export type FindOptionsInclude<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = {
  [K in keyof TModel['relations']]?:
  K extends string
    ? TModel['relations'] extends Record<string, infer TRelation extends ModelRelation>
      ? TRelation['to'] extends Record<infer TTargetModelName extends string, any>
        ? ModelByName<TSchema, TTargetModelName> extends infer TTargetModel extends Model
          ? FindOptionsIncludeItem<TTargetModel, TModelDefaults, TSchema>
          : never
        : never
      : never
    : never
} & {
  [K in keyof NonNullable<RelationsByName<TSchema, TModel['name']>>]?:
  K extends string
    ? NonNullable<RelationsByName<TSchema, TModel['name']>>[K] extends infer TRelation extends ModelRelation
      ? TRelation['to'] extends Record<string, infer TTargetModelData extends {
        '~model': Model
      }>
        ? FindOptionsIncludeItem<TTargetModelData['~model'], TModelDefaults, TSchema>
        : never
      : never
    : never
}

export type FindOptionsIncludeItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = boolean | FindOptionsInclude<TModel, TModelDefaults, TSchema>

export interface FindOptionsBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Parameters sent to the adapter plugins. Usually used for filtering and sorting the data in the backend.
   */
  params?: CustomParams<TModel, TModelDefaults, TSchema>
  /**
   * Filter the item.
   */
  filter?: ((item: ResolvedModelItem<TModel, TModelDefaults, TSchema>) => boolean) | CustomFilterOption<TModel, TModelDefaults, TSchema>
  /**
   * Sort the items.
   */
  sort?: ((a: ResolvedModelItem<TModel, TModelDefaults, TSchema>, b: ResolvedModelItem<TModel, TModelDefaults, TSchema>) => number) | CustomSortOption<TModel, TModelDefaults, TSchema>
  /**
   * Include the related items.
   */
  include?: FindOptionsInclude<TModel, TModelDefaults, TSchema>
  /**
   * Fetch policy for the query.
   *
   * `cache-first` means that the query will first try to fetch the data from the cache. If the data is not found in the cache, it will fetch the data from the adapter plugins.
   *
   * `cache-and-fetch` means that the query will first try to fetch the data from the cache. It will then fetch the data from the adapter plugins and update the cache.
   *
   * `fetch-only` means that the query will only fetch the data from the adapter plugins.
   * The data will stored in the cache when the query is resolved.
   *
   * `cache-only` means that the query will only fetch the data from the cache.
   *
   * `no-cache` means that the query will not use the cache and only fetch the data from the adapter plugins. No data will be stored in the cache.
   */
  fetchPolicy?: FetchPolicy

  /**
   * Deduplicate findFirst and findMany that are called with the same findOptions at the same time.
   *
   * Comparison is done with JSON.stringfy.
   *
   * @default true
   */
  dedupe?: boolean

  /**
   * Enable or disable the query.
   */
  enabled?: boolean

  /**
   * Experimental: Enable garbage collection for items that are not referenced by any query or other item.
   */
  experimentalGarbageCollection?: boolean

  /**
   * Experimental: Filter out dirty items from the results.
   *
   * Items are marked as dirty when they are not returned by a query.
   */
  experimentalFilterDirty?: boolean
}

export type FindFirstOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = FindOptions<TModel, TModelDefaults, TSchema> & {
  /**
   * Key of the item. Usually used for fetching the item by its key (e.g. ID).
   */
  key?: string | number
}

export type FindManyOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = FindOptions<TModel, TModelDefaults, TSchema>

export interface QueryResult<TResult> {
  result: TResult
  marker?: string
}
