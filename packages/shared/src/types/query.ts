/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionByName, CollectionDefaults, CollectionRelation, RelationsByName, ResolvedCollectionItem, StoreSchema } from './collection'
import type { CustomHookMeta } from './hooks'

export interface CustomParams<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {}

export interface CustomFilterOption<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {}

export interface CustomSortOption<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {}

export interface FindOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> extends FindOptionsBase<TCollection, TCollectionDefaults, TSchema> {}

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
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = {
  [K in keyof TCollection['relations']]?:
  K extends string
    ? TCollection['relations'] extends Record<string, infer TRelation extends CollectionRelation>
      ? TRelation['to'] extends Record<infer TTargetCollectionName extends string, any>
        ? CollectionByName<TSchema, TTargetCollectionName> extends infer TTargetCollection extends Collection
          ? FindOptionsIncludeItem<TTargetCollection, TCollectionDefaults, TSchema>
          : never
        : never
      : never
    : never
} & {
  [K in keyof NonNullable<RelationsByName<TSchema, TCollection['name']>>]?:
  K extends string
    ? NonNullable<RelationsByName<TSchema, TCollection['name']>>[K] extends infer TRelation extends CollectionRelation
      ? TRelation['to'] extends Record<string, infer TTargetCollectionData extends {
        '~collection': Collection
      }>
        ? FindOptionsIncludeItem<TTargetCollectionData['~collection'], TCollectionDefaults, TSchema>
        : never
      : never
    : never
}

export type FindOptionsIncludeItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = boolean | FindOptionsInclude<TCollection, TCollectionDefaults, TSchema>

export interface FindOptionsBase<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Parameters sent to the adapter plugins. Usually used for filtering and sorting the data in the backend.
   */
  params?: CustomParams<TCollection, TCollectionDefaults, TSchema>
  /**
   * Filter the item.
   */
  filter?: ((item: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>) => boolean) | CustomFilterOption<TCollection, TCollectionDefaults, TSchema>
  /**
   * Sort the items.
   */
  sort?: ((a: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>, b: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>) => number) | CustomSortOption<TCollection, TCollectionDefaults, TSchema>
  /**
   * Include the related items.
   */
  include?: FindOptionsInclude<TCollection, TCollectionDefaults, TSchema>
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
   * Index of the page in the pagination.
   *
   * Inside a query, will be used to put the page in the `pages` array. If not specified, the page will be added to the end of the `pages` array.
   */
  pageIndex?: number

  /**
   * Size of the page in the pagination.
   */
  pageSize?: number

  /**
   * Experimental: Enable garbage collection for items that are not referenced by any query or other item.
   */
  experimentalGarbageCollection?: boolean

  meta?: CustomHookMeta
}

export type FindFirstOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = FindOptions<TCollection, TCollectionDefaults, TSchema> & {
  /**
   * Key of the item. Usually used for fetching the item by its key (e.g. ID).
   */
  key?: string | number
}

export type FindManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = FindOptions<TCollection, TCollectionDefaults, TSchema>

export interface QueryResult<TResult> {
  result: TResult
  marker?: string
}
