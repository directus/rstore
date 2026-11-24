import type { Cache, Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, StoreSchema } from '@rstore/shared'
import type { VueCachePrivate } from './cache'
import type { VueStore } from './store'
import type { TrackedItem, VisibleMembership, VisibleMembershipChange } from './trackingVisible'
import type { VisibleGraphMembership } from './trackingVisibleGraph'
import { watchQueryTracking } from './trackingEffect'
import { findTrackedCollection } from './trackingRelations'
import { createVisibleMembership } from './trackingVisible'
import { createVisibleGraphMembership } from './trackingVisibleGraph'

/** The current cache-backed result and its relation selection. */
interface VisibleResult {
  /** Result exposed by the query. */
  result: unknown
  /** Included relations exposed by that result. */
  include?: FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>
  /** Whether the query collects rows on release. */
  collecting: boolean
}

/** Retain the live result independently of the query's last fetched pages. */
export function createVisibleQueryOwnership(
  store: VueStore,
  id: string,
  read: () => VisibleResult | undefined,
  getDirtyQueryId: () => string | undefined,
  hasPageOwner: (item: TrackedItem) => boolean,
  scheduleReleased: (tracking: HookMetaQueryTracking) => void,
) {
  const cache = store.$cache as Cache & VueCachePrivate
  const wrappers = new Set<TrackedItem>()
  let active: VisibleMembership | VisibleGraphMembership | undefined
  let result: unknown
  let collecting = false

  const flat = createVisibleMembership()
  const graph = createVisibleGraphMembership(store, (change) => {
    if (active === graph)
      applyChange(change, collecting)
  }, { dirtyQueryId: getDirtyQueryId })

  /** Drop visible ownership without releasing a fetched page's ownership. */
  function release(item: TrackedItem): void {
    if (wrappers.delete(item) && !hasPageOwner(item) && item.$meta.queries.delete(id) && !item.$meta.queries.size) {
      const collection = findTrackedCollection(store, item.$collection)
      if (collection)
        cache._private.touchRow(collection, item.$getKey())
    }
  }

  /** Forget the visible lease when an authoritative page removed the query marker. */
  function exclude(item: TrackedItem): void {
    wrappers.delete(item)
  }

  /** Adopt entering wrappers before scheduling collection of departed keys. */
  function applyChange(change: VisibleMembershipChange, collect: boolean): void {
    for (const item of change.removedItems)
      release(item)
    const dirtyQueryId = getDirtyQueryId()
    for (const item of change.added) {
      if (!dirtyQueryId || !item.$meta.dirtyQueries.has(dirtyQueryId)) {
        item.$meta.queries.add(id)
        wrappers.add(item)
      }
    }
    if (collect)
      scheduleReleased(change.removed)
  }

  /** End the current visible result's ownership and stop its relation effects. */
  function clear(collect: boolean): void {
    if (!active)
      return
    const tracking = active.tracking
    active.reset()
    active = undefined
    result = undefined
    for (const item of wrappers)
      release(item)
    if (collect)
      scheduleReleased(tracking)
  }

  const stop = watchQueryTracking(store, () => {
    try {
      return read()
    }
    catch {
      // A component can invalidate its options just before disposal.
      return null
    }
  }, (source) => {
    if (source === null)
      return
    if (!source) {
      clear(false)
      return
    }
    const membership = source.include ? graph : flat
    if (active !== membership || collecting !== source.collecting)
      clear(source.collecting && collecting)
    if (active === membership && result === source.result && (!source.include || graph.matches(source.include)))
      return
    active = membership
    result = source.result
    collecting = source.collecting
    applyChange(source.include ? graph.update(result, source.include) : flat.update(result), collecting)
  }, { immediate: true })

  /** Reuse the live relation traversal for an equivalent cache-only page snapshot. */
  function matchingKeys(resultToMatch: unknown, include: VisibleResult['include']): HookMetaQueryTracking | undefined {
    if (active !== graph || !graph.matches(include))
      return undefined
    if (result === resultToMatch || (Array.isArray(result) && Array.isArray(resultToMatch)
      && result.length === resultToMatch.length && result.every((row, index) => row === resultToMatch[index]))) {
      return graph.tracking
    }
  }

  /** Whether the displayed result currently owns this wrapper. */
  function owns(item: TrackedItem): boolean {
    return wrappers.has(item)
  }

  return { owns, exclude, clear, stop, matchingKeys }
}
