/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ModelMap, ResolvedModelItem } from './model'

export interface CustomParams {}

export interface CustomFilterOption<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> {}

export interface CustomSortOption {}

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

export interface FindOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> {
  /**
   * Parameters sent to the adapter plugins. Usually used for filtering and sorting the data in the backend.
   */
  params?: CustomParams
  /**
   * Filter the item.
   */
  filter?: ((item: ResolvedModelItem<TModel, TModelDefaults, TModelMap>) => boolean) | CustomFilterOption<TModel, TModelDefaults, TModelMap>
  /**
   * Sort the items.
   */
  sort?: ((a: ResolvedModelItem<TModel, TModelDefaults, TModelMap>, b: ResolvedModelItem<TModel, TModelDefaults, TModelMap>) => number) | CustomSortOption
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
}

export interface FindFirstOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> extends FindOptions<TModel, TModelDefaults, TModelMap> {
  /**
   * Key of the item. Usually used for fetching the item by its key (e.g. ID).
   */
  key?: string
}

export interface FindManyOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> extends FindOptions<TModel, TModelDefaults, TModelMap> {
  // nothing here yet
}

export interface QueryResult<TResult> {
  result: TResult
  marker?: string
}
