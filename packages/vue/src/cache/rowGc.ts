import type { ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { getItemWrapKey } from './context'
import { isKeyPinnedByActiveLayer } from './layers'
import { sweepQueryState } from './queryRetention'
import { getPageQueryId, isQueryStateKeyForCollection } from './queryState'
import { garbageCollectItem, getWrappedItem, releaseUnwrittenItems } from './wrapped'

/** Whether the committed row exists and its canonical wrapper has no active owner. */
function canEvict(ctx: CacheRuntime, collection: ResolvedCollection, key: string | number): boolean {
  return !!ctx.state.collections[collection.name]?.value[key]
    && !ctx.membership.pins(collection.name, key)
    && !ctx.retainedRows.get(collection.name)?.has(String(key))
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
  sweepQueryState(ctx)
  const preferred = preferExactPageRows(ctx, collections)
  const selected = rowRetention.select(collections, (collection, key) => canEvict(ctx, collection, key), Date.now(), (collection, key) => preferred.get(collection.name)?.has(String(key)) === true)
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
