import type { ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import type { GarbageCollectionCandidate } from './wrapped'
import { garbageCollectItems, getWrappedItem } from './wrapped'

/** Check base ownership without materializing wrappers for every candidate. */
function canEvict(ctx: CacheRuntime, collection: ResolvedCollection, key: string | number): boolean {
  return ctx.engine.isGarbageCollectible(collection.name, key)
    && !ctx.wrappedItems.get(collection.name, key)?.metadata.queries.size
}

/** Enforce limits on unused rows, then evict through the normal batched GC path. */
export function sweepManagedRows(ctx: CacheRuntime, names?: ReadonlySet<string>): void {
  if (ctx.disposed)
    return
  ctx.trackingEffects.flush()
  const all = ctx.getStore().$collections
  const collections = names && !ctx.rowRetention.sharedLimit ? all.filter(collection => names.has(collection.name)) : all
  const { rowRetention } = ctx
  sweepQueryState(ctx)
  const preferred = preferExactPageRows(ctx, collections)
  const selected = rowRetention.select(collections, (collection, key) => canEvict(ctx, collection, key), Date.now(), (collection, key) => preferred.get(collection.name)?.has(String(key)) === true)
  for (const [collection, uses] of selected) {
    const candidates: GarbageCollectionCandidate<any>[] = []
    for (const use of uses) {
      const { key } = use
      if (!rowRetention.isCurrent(collection, use) || !canEvict(ctx, collection, key))
        continue
      const item = getWrappedItem(ctx, collection, ctx.engine.readBaseItemRaw({ collection, key }), false, key)
      if (item)
        candidates.push({ item, key })
    }
    garbageCollectItems(ctx, collection, candidates)
  }
}

/** Record a cache hit or query release for a committed base row. */
export function touchCommittedRow(ctx: CacheRuntime, collection: ResolvedCollection, key: string | number, now?: number): void {
  if (ctx.rowRetention.tracks(collection) && ctx.engine.readBaseItemRaw({ collection, key }) !== undefined)
    ctx.rowRetention.touch(collection, key, now)
}
