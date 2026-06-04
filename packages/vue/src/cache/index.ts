import type { Cache, CollectionDefaults, StoreSchema } from '@rstore/shared'
import type { CreateCacheOptions } from './types'
import { createCacheApi } from './api'
import { createCacheRuntime } from './context'

export type { CreateCacheOptions, VueCachePrivate, VueCacheState } from './types'

/** Create a Vue-backed rstore cache. */
export function createCache<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>(options: CreateCacheOptions<TSchema, TCollectionDefaults>): Cache {
  return createCacheApi(createCacheRuntime(options))
}
