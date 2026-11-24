import type { ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import type { GarbageCollectionCandidate } from './wrapped'
import { sweepQueryState } from './queryRetention'
import { getPageQueryId, isQueryStateKeyForCollection } from './queryState'
import { garbageCollectItems, getWrappedItem } from './wrapped'

/** Check base ownership without materializing wrappers for every candidate. */
function canEvict(ctx: CacheRuntime, collection: ResolvedCollection, key: string | number): boolean {
  return ctx.engine.isGarbageCollectible(collection.name, key)
    && !ctx.membership.pins(collection.name, key)
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
/** Keep whole warm exact pages ahead of other unused rows when pressure allows. */
function preferExactPageRows(ctx: CacheRuntime, collections: ResolvedCollection[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const [pageId, page] of ctx.state.pageRefs) {
    if (!page.confirmed || (page.effectiveOptions as { resultMode?: string } | undefined)?.resultMode !== 'responseRefs' || page.type === 'data')
      continue
    for (const [collection, keys] of Object.entries(page.requiredRows ?? {})) {
      const saved = result.get(collection) ?? new Set()
      for (const key of keys)
        saved.add(String(key))
      result.set(collection, saved)
    }
    const id = getPageQueryId(pageId)
    const collection = id && collections.find(candidate => isQueryStateKeyForCollection(id, candidate.name))
    if (!collection)
      continue
    const keys = result.get(collection.name) ?? new Set()
    for (const key of page.type === 'refs' ? page.keys : [page.key])
      keys.add(String(key))
    result.set(collection.name, keys)
  }
  return result
}
