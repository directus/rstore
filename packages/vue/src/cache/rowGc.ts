import type { ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { getItemWrapKey } from './context'
import { isKeyPinnedByActiveLayer } from './layers'
import { sweepQueryState } from './queryRetention'
import { garbageCollectItem, getWrappedItem, releaseUnwrittenItems } from './wrapped'

/** Whether the committed row exists and its canonical wrapper has no active owner. */
function canEvict(ctx: CacheRuntime, collection: ResolvedCollection, key: string | number): boolean {
  return !!ctx.state.collections[collection.name]?.value[key]
    && !isKeyPinnedByActiveLayer(ctx, collection.name, key)
    && !ctx.wrappedItemsMetadata.get(getItemWrapKey(collection, key, undefined))?.queries.size
}

/** Enforce limits on unused committed rows, without making GC's own lookups count as use. */
export function sweepManagedRows(ctx: CacheRuntime, names?: ReadonlySet<string>): void {
  if (ctx.disposed)
    return
  const all = ctx.getStore().$collections
  const collections = names && !ctx.rowRetention.sharedLimit ? all.filter(collection => names.has(collection.name)) : all
  const { rowRetention } = ctx
  const selected = rowRetention.select(collections, (collection, key) => canEvict(ctx, collection, key))
  for (const [collection, uses] of selected) {
    for (const use of uses) {
      const { key } = use
      if (!rowRetention.isCurrent(collection, use) || !canEvict(ctx, collection, key))
        continue
      const item = getWrappedItem(ctx, collection, ctx.state.collections[collection.name]!.value[key])
      if (item)
        garbageCollectItem(ctx, collection, item, key)
    }
  }
}

/** Collect unused rows, detached wrappers, and saved query state. */
export function garbageCollect(ctx: CacheRuntime) {
  sweepManagedRows(ctx)
  for (const collectionName in ctx.state.collections) {
    const collection = ctx.getStore().$collections.find(m => m.name === collectionName)
    if (!collection || ctx.rowRetention.managed(collection)) {
      continue
    }
    const itemsForType = ctx.state.collections[collectionName]?.value
    if (!itemsForType) {
      continue
    }
    for (const key in itemsForType) {
      const wrappedItem = getWrappedItem(ctx, collection, itemsForType[key])
      if (wrappedItem) {
        garbageCollectItem(ctx, collection, wrappedItem)
      }
    }
  }
  // Rows whose queued write was dropped or rejected are only reachable here.
  releaseUnwrittenItems(ctx)
  sweepQueryState(ctx)
}
