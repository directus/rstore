/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ResolvedModelItem, StoreSchema } from './model'

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
  include?: {
    [TKey in keyof TModel['relations']]?: boolean
  }
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
