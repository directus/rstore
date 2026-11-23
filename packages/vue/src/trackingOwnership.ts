import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { VueCachePrivate } from './cache'
import type { VueStore } from './store'
import type { VisibleMembershipChange } from './trackingVisible'
import { computed, ref, toValue } from 'vue'
import { createQueryCollector } from './trackingCollection'
import { DirtyQueryMemberships } from './trackingDirtyMemberships'
import { forEachTrackedItem, forEachTrackedKey, resultIsEmpty, trackingHasKey } from './trackingKeys'
import { addToQueryTracking, createTrackingObject, findTrackedCollection, populateTracking } from './trackingRelations'
import { createVisibleGraphMembership } from './trackingVisibleGraph'
import { createVisibleQueryOwnership } from './trackingVisibleOwnership'

/** Options needed to reconcile one query's page ownership. */
export interface QueryTrackingOwnershipOptions<TResult> {
  /** Store containing cached items. */
  store: VueStore
  /** Cache-backed result exposed by the query. */
  cached: MaybeRefOrGetter<TResult>
  /** Network/page result used when cache data is unavailable. */
  result?: MaybeRefOrGetter<TResult>
  /** Included relations selected by the current query options. */
  include?: () => FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> | undefined
  /** Whether a collecting query also exposes a live, cache-computed result. */
  computedCacheResult?: () => boolean
}

/** Controller kept for one logical query, with ownership separated by page id. */
export interface QueryTrackingController<TResult> {
  /** Query result with items released by this query removed. */
  filteredCached: ComputedRef<TResult>
  /** Create hook metadata for one page load. */
  createTrackingObject: () => HookMetaQueryTracking
  /** Reconcile one successfully replaced page. */
  handleQueryTracking: (pageId: string, tracking: HookMetaQueryTracking, result: TResult | undefined, include: FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> | undefined, reconcilePrevious: boolean) => void
  /** Release ownership held by one page. */
  releasePage: (pageId: string, options: { collect: boolean }) => void
  /** Release ownership held by every page. */
  releaseAll: (options: { collect: boolean }) => void
  /** Release all leases and prevent a stopped query from reacquiring them. */
  dispose: () => void
  /** Enable or disable ownership for current reactive query options. */
  setEnabled: (enabled: boolean, collect?: boolean) => void
  /** Public compatibility access to relation tracking. */
  addToQueryTracking: (tracking: HookMetaQueryTracking, item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>, include?: FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>) => void
}

/** Create page-aware ownership and filtered cache reads for one query. */
export function createQueryTrackingController<TResult>(options: QueryTrackingOwnershipOptions<TResult>): QueryTrackingController<TResult> {
  const { store } = options
  const cache = store.$cache as Cache & VueCachePrivate
  const trackingQueryId = crypto.randomUUID()
  const pageTrackings = new Map<string, HookMetaQueryTracking>()
  const relationWatchers = new Map<string, () => void>()
  // Historical exclusions can outlive page membership while a peer owns rows.
  const dirtyMetadata = new DirtyQueryMemberships(trackingQueryId)
  const enabled = ref(false)
  const collecting = ref(true)
  const dataKey = ref(0)
  const collector = createQueryCollector(store)

  const filteredCached = computed<TResult>(() => {
    // Make deferred releases observable even if a cache array was not replaced.
    void dataKey.value
    const result = toValue(options.cached)
    if (!enabled.value || !collecting.value || !result) {
      return result
    }
    if (Array.isArray(result)) {
      return result.filter(item => !item.$meta.dirtyQueries.has(trackingQueryId)) as TResult
    }
    const item = result as unknown as WrappedItemBase<Collection, CollectionDefaults, StoreSchema>
    return (!item.$meta.dirtyQueries.has(trackingQueryId) ? result : null) as TResult
  })

  const visible = createVisibleQueryOwnership(store, trackingQueryId, () => {
    if (!enabled.value || (collecting.value && !options.computedCacheResult?.()))
      return undefined
    return { result: filteredCached.value, include: options.include?.(), collecting: collecting.value }
  }, () => collecting.value ? trackingQueryId : undefined, hasPageOwner, collector.scheduleReleased)

  /** Leave the query's shared ownership marker in place while a page owns this wrapper. */
  function hasPageOwner(item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>): boolean {
    const key = item.$getKey()
    if (!isTrackedByAnotherPage(item.$collection, key))
      return false
    const collection = findTrackedCollection(store, item.$collection)
    return !!collection && store.$cache.readItem({ collection, key }) === item
  }

  /** Mark every cached member of a page as retained by this query. */
  function retain(tracking: HookMetaQueryTracking): void {
    forEachTrackedItem(store, tracking, (item) => {
      item.$meta.queries.add(trackingQueryId)
      dirtyMetadata.delete(item.$meta)
    })
  }

  /** Release only keys no current page of this query still owns. */
  function releaseMembers(tracking: HookMetaQueryTracking, collect: boolean): void {
    let changed = false
    forEachTrackedKey(tracking, (collectionName, key) => {
      if (isTrackedByAnotherPage(collectionName, key)) {
        return
      }
      const collection = findTrackedCollection(store, collectionName)
      if (!collection)
        return
      const item = store.$cache.readItem({ collection, key }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
      if (!item)
        return
      if (collect || !visible.owns(item))
        item.$meta.queries.delete(trackingQueryId)
      if (!collect) {
        dirtyMetadata.delete(item.$meta)
        return
      }
      dirtyMetadata.add(item.$meta)
      // A page exclusion takes precedence over the query's own visible lease.
      // Other queries still hold their independent leases on the same row.
      visible.exclude(item)
      changed = true
      collector.schedule(collection, key)
    })
    if (changed)
      dataKey.value++
  }

  /** Check whether a different page holds a collection/key cache identity. */
  function isTrackedByAnotherPage(collectionName: string, key: string | number): boolean {
    for (const tracking of pageTrackings.values()) {
      if (trackingHasKey(tracking, collectionName, key)) {
        return true
      }
    }
    return false
  }

  /** Install a page's membership, retain entering wrappers, then release departures. */
  function applyPageChange(pageId: string, tracking: HookMetaQueryTracking, change: VisibleMembershipChange, previous: HookMetaQueryTracking | undefined, collect: boolean): void {
    pageTrackings.set(pageId, tracking)
    for (const item of change.added) {
      item.$meta.queries.add(trackingQueryId)
      dirtyMetadata.delete(item.$meta)
    }
    // A full previous payload comes from the other mode, a released page or
    // the payload installed by the page load.
    releaseMembers(previous && previous !== tracking ? previous : change.removed, collect)
  }

  const controller: QueryTrackingController<TResult> = {
    filteredCached,
    createTrackingObject,
    addToQueryTracking: (tracking, item, include) => addToQueryTracking(store, tracking, item, include),

    handleQueryTracking(pageId, tracking, result, include, reconcilePrevious) {
      const previous = pageTrackings.get(pageId)
      if (tracking.skipped && previous) {
        return
      }
      const next = tracking.skipped ? createTrackingObject() : tracking
      const resolved = result === undefined ? toValue(options.result) : result
      // Cache hooks may report a skipped payload with no page result at all.
      // First ownership after enabling GC still has to be seeded from the
      // currently visible cache result, otherwise the next sweep evicts it.
      const roots = tracking.skipped && resultIsEmpty(resolved)
        ? toValue(options.cached)
        : resolved
      const visibleKeys = tracking.skipped && include ? visible.matchingKeys(roots, include) : undefined
      if (visibleKeys) {
        // The page snapshot must be independent of subsequent visible updates.
        for (const [name, keys] of Object.entries(visibleKeys.items))
          next.items[name] = new Set(keys)
      }
      else {
        populateTracking(store, next, roots, include)
      }
      // Install before releasing, so replacement overlap remains owned.
      pageTrackings.set(pageId, next)
      retain(next)
      if (previous && reconcilePrevious) {
        releaseMembers(previous, collecting.value)
      }
      relationWatchers.get(pageId)?.()
      relationWatchers.delete(pageId)
      if (include) {
        // This graph starts after asynchronous loading, so page lifecycle owns
        // its disposal explicitly. Each reached row re-reads only its own
        // relations, once per commit and before immediate public GC.
        const graph = createVisibleGraphMembership(store, (change) => {
          const previous = pageTrackings.get(pageId)
          if (previous)
            applyPageChange(pageId, graph.tracking, change, previous, collecting.value)
        }, {
          // A released nested row can remain in the shared cache until its
          // deferred sweep. Do not let a sibling deletion re-adopt it.
          dirtyQueryId: () => collecting.value ? trackingQueryId : undefined,
        })
        // The installed page payload already retains this first traversal.
        graph.update(roots, include)
        relationWatchers.set(pageId, graph.reset)
      }
    },

    releasePage(pageId, { collect }) {
      relationWatchers.get(pageId)?.()
      relationWatchers.delete(pageId)
      const tracking = pageTrackings.get(pageId)
      if (!tracking) {
        return
      }
      pageTrackings.delete(pageId)
      releaseMembers(tracking, collect && collecting.value)
    },

    releaseAll({ collect }) {
      visible.clear(collect && collecting.value)
      for (const pageId of Array.from(pageTrackings.keys())) {
        controller.releasePage(pageId, { collect })
      }
      // With no pages left, no read can need this query's historical exclusions.
      dirtyMetadata.clear()
    },

    dispose() {
      visible.stop()
      enabled.value = false
      controller.releaseAll({ collect: true })
    },

    setEnabled(nextEnabled, nextCollecting = true) {
      if (!nextCollecting && collecting.value) {
        dirtyMetadata.clear()
      }
      collecting.value = nextCollecting
      if (enabled.value === nextEnabled) {
        return
      }
      enabled.value = nextEnabled
      if (!nextEnabled) {
        controller.releaseAll({ collect: false })
      }
    },
  }
  return controller
}
