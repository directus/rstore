import type { CustomCacheState } from '@rstore/shared'
import type { CacheRuntime } from './types'

/**
 * Recover the original type of an item key read from a serialized object.
 *
 * Object keys lose their numeric type in transit. The restored row's schema
 * key recovers it without coercing string IDs such as "01" or changing
 * metadata for absent rows or explicitly overridden cache keys.
 */
export function resolveHydratedKey(ctx: CacheRuntime, value: CustomCacheState, collectionName: string, key: string): string | number {
  const collection = ctx.getStore().$collections.find(candidate => candidate.name === collectionName)
  const item = value.collections?.[collectionName]?.[key]
  const itemKey = item && collection?.getKey(item)
  return typeof itemKey === 'number' && String(itemKey) === key ? itemKey : key
}
