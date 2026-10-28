import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { VueStore } from './store'
import { computed, nextTick, ref, toValue, watch } from 'vue'
import { DirtyQueryMemberships } from './trackingDirtyMemberships'
import { addToQueryTracking, createTrackingObject, populateTracking } from './trackingRelations'

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
  const trackingQueryId = crypto.randomUUID()
  const pageTrackings = new Map<string, HookMetaQueryTracking>()
  const relationWatchers = new Map<string, () => void>()
  // Historical exclusions can outlive page membership while a peer owns rows.
  const dirtyMetadata = new DirtyQueryMemberships(trackingQueryId)
  const enabled = ref(false)
  const collecting = ref(true)
  const dataKey = ref(0)
  const visiblePageId = '\0visible'

  const filteredCached = computed<TResult>(() => {
    // Make deferred releases observable even if a cache array was not replaced.
    void dataKey.value
    const result = toValue(options.cached)
    if (enabled.value && !collecting.value) {
      const tracking = createTrackingObject()
      populateTracking(store, tracking, result, options.include?.())
      updateVisibleTracking(tracking)
    }
    if (!enabled.value || !collecting.value || !result) {
      return result
    }
    if (Array.isArray(result)) {
      return result.filter(item => !item.$meta.dirtyQueries.has(trackingQueryId)) as TResult
    }
    const item = result as unknown as WrappedItemBase<Collection, CollectionDefaults, StoreSchema>
    return (!item.$meta.dirtyQueries.has(trackingQueryId) ? result : null) as TResult
  })

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
      const collection = store.$collections.find(candidate => candidate.name === collectionName)
      const item = collection && store.$cache.readItem({ collection, key }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
      if (!item) {
        return
      }
      item.$meta.queries.delete(trackingQueryId)
      if (!collect) {
        dirtyMetadata.delete(item.$meta)
        return
      }
      dirtyMetadata.add(item.$meta)
      changed = true
      nextTick(() => store.$cache.garbageCollectItem({ collection: collection!, item: item as any }))
    })
    if (changed) {
      dataKey.value++
    }
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
      const visible = tracking.skipped && resultIsEmpty(resolved)
        ? toValue(options.cached)
        : resolved
      populateTracking(store, next, visible, include)
      // Install before releasing, so replacement overlap remains owned.
      pageTrackings.set(pageId, next)
      retain(next)
      if (previous && reconcilePrevious) {
        releaseMembers(previous, collecting.value)
      }
      relationWatchers.get(pageId)?.()
      relationWatchers.delete(pageId)
      if (include) {
        // This watcher starts after asynchronous loading, so page lifecycle owns
        // its disposal explicitly. Track relation reads, not mutable ownership
        // metadata. Synchronous adoption protects even immediate public GC.
        const stop = watch(() => {
          const current = createTrackingObject()
          // A released nested row can remain in the shared cache until its
          // deferred sweep. Do not let a sibling deletion re-adopt it.
          populateTracking(store, current, visible, include, collecting.value ? trackingQueryId : undefined)
          return current
        }, (current) => {
          const previous = pageTrackings.get(pageId)
          if (!previous)
            return
          pageTrackings.set(pageId, current)
          retain(current)
          releaseMembers(previous, collecting.value)
        }, { flush: 'sync' })
        relationWatchers.set(pageId, stop)
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
      for (const pageId of Array.from(pageTrackings.keys())) {
        controller.releasePage(pageId, { collect })
      }
      // With no pages left, no read can need this query's historical exclusions.
      dirtyMetadata.clear()
    },

    dispose() {
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
  // Non-collecting computed queries expose every matching cached row, not only
  // rows returned by their last fetch. Retain that live view as it changes.
  watch(() => {
    if (!enabled.value || collecting.value)
      return undefined
    try {
      const tracking = createTrackingObject()
      populateTracking(store, tracking, toValue(options.cached), options.include?.())
      return tracking
    }
    catch {
      // A component can invalidate its options immediately before unmount.
      // Keep its last lease until normal query handling or scope disposal.
      return pageTrackings.get(visiblePageId)
    }
  }, updateVisibleTracking, { flush: 'pre' })

  /** Retain the live cache view before releasing its prior membership. */
  function updateVisibleTracking(tracking: HookMetaQueryTracking | undefined): void {
    const previous = pageTrackings.get(visiblePageId)
    if (tracking) {
      pageTrackings.set(visiblePageId, tracking)
      retain(tracking)
    }
    else {
      pageTrackings.delete(visiblePageId)
    }
    if (previous)
      releaseMembers(previous, false)
  }

  return controller
}

/** Iterate cached items represented by a tracking object. */
function forEachTrackedItem(
  store: VueStore,
  tracking: HookMetaQueryTracking,
  callback: (item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>) => void,
): void {
  forEachTrackedKey(tracking, (collectionName, key) => {
    const collection = store.$collections.find(candidate => candidate.name === collectionName)
    const item = collection && store.$cache.readItem({ collection, key }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
    if (item) {
      callback(item)
    }
  })
}

/** Iterate collection/key pairs in a tracking object. */
function forEachTrackedKey(tracking: HookMetaQueryTracking, callback: (collectionName: string, key: string | number) => void): void {
  for (const [collectionName, keys] of Object.entries(tracking.items)) {
    for (const key of keys) {
      callback(collectionName, key)
    }
  }
}

/** Whether a page result supplies no item identity to a skipped payload. */
function resultIsEmpty<TResult>(result: TResult | undefined): boolean {
  return result == null || (Array.isArray(result) && result.length === 0)
}

/** Check string-equivalent cache identity with at most two Set lookups. */
function trackingHasKey(tracking: HookMetaQueryTracking, collectionName: string, key: string | number): boolean {
  const keys = tracking.items[collectionName]
  if (!keys)
    return false
  if (keys.has(key))
    return true
  if (typeof key === 'number')
    return keys.has(String(key))
  const numericKey = Number(key)
  // Round-trip before matching: '01', '1.0', and '-0' differ from numeric keys.
  return String(numericKey) === key && keys.has(numericKey)
}
