/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ModelList, ResolvedModelItem } from './model'

export interface CustomParams<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {}

export interface CustomFilterOption<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {}

export interface CustomSortOption<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {}

export interface FindOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> extends FindOptionsBase<TModel, TModelDefaults, TModelList> {}

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
  TModelList extends ModelList,
> {
  /**
   * Parameters sent to the adapter plugins. Usually used for filtering and sorting the data in the backend.
   */
  params?: CustomParams<TModel, TModelDefaults, TModelList>
  /**
   * Filter the item.
   */
  filter?: ((item: ResolvedModelItem<TModel, TModelDefaults, TModelList>) => boolean) | CustomFilterOption<TModel, TModelDefaults, TModelList>
  /**
   * Sort the items.
   */
  sort?: ((a: ResolvedModelItem<TModel, TModelDefaults, TModelList>, b: ResolvedModelItem<TModel, TModelDefaults, TModelList>) => number) | CustomSortOption<TModel, TModelDefaults, TModelList>
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
}

export type FindFirstOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = FindOptions<TModel, TModelDefaults, TModelList> & {
  /**
   * Key of the item. Usually used for fetching the item by its key (e.g. ID).
   */
  key?: string | number
}

export type FindManyOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = FindOptions<TModel, TModelDefaults, TModelList>

export interface QueryResult<TResult> {
  result: TResult
  marker?: string
}
