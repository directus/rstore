import type { CustomCacheState, FieldTimestamps } from '@rstore/shared'
import type { CacheRuntime } from './types'

/** Replace causal metadata while retaining the existing serialized object format. */
export function restoreCausality(ctx: CacheRuntime, value: CustomCacheState): void {
  ctx.state.fieldTimestamps.clear()
  for (const [, tombstone] of Array.from(ctx.state.tombstones.entries())) {
    ctx.state.tombstones.clear(tombstone.collection, tombstone.key)
  }
  for (const collectionName in value.fieldTimestamps) {
    const collection = ctx.getStore().$collections.find(candidate => candidate.name === collectionName)
    const keys = new Map<string | number, FieldTimestamps>()
    const incoming = value.fieldTimestamps[collectionName]!
    for (const key in incoming) {
      const item = value.collections[collectionName]?.[key]
      const itemKey = item && collection?.getKey(item)
      // Object keys lose their numeric type in transit. The restored row's
      // schema key recovers it without coercing string IDs such as "01" or
      // changing metadata for absent rows or explicitly overridden cache keys.
      const restoredKey = typeof itemKey === 'number' && String(itemKey) === key ? itemKey : key
      keys.set(restoredKey, { ...incoming[key] })
    }
    ctx.state.fieldTimestamps.set(collectionName, keys)
  }
  for (const tombstone of value.tombstones ?? []) {
    ctx.state.tombstones.set(tombstone)
  }
}
