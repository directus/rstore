/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ModelType, ResolvedModelItem } from './model'

export interface CustomParams {}

export interface CustomFilterOption<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
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
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  /**
   * Parameters sent to the adapter plugins. Usually used for filtering and sorting the data in the backend.
   */
  params?: CustomParams
  /**
   * Filter the item.
   */
  filter?: ((item: ResolvedModelItem<TModelType, TModelDefaults, TModel>) => boolean) | CustomFilterOption<TModelType, TModelDefaults, TModel>
  /**
   * Sort the items.
   */
  sort?: ((a: ResolvedModelItem<TModelType, TModelDefaults, TModel>, b: ResolvedModelItem<TModelType, TModelDefaults, TModel>) => number) | CustomSortOption
  /**
   * Include the related items.
   */
  include?: {
    [TKey in keyof TModelType['relations']]?: boolean
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
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> extends FindOptions<TModelType, TModelDefaults, TModel> {
  /**
   * Key of the item. Usually used for fetching the item by its key (e.g. ID).
   */
  key?: string
}

export interface FindManyOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> extends FindOptions<TModelType, TModelDefaults, TModel> {
  // nothing here yet
}

export interface QueryResult<TResult> {
  result: TResult
  marker?: string
}
