import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, ResolvedCollection, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { VueStore } from './store'
import type { VisibleMembershipChange } from './trackingVisible'
import { computed, nextTick, ref, toValue } from 'vue'
import { DirtyQueryMemberships } from './trackingDirtyMemberships'
import { watchQueryTracking } from './trackingEffect'
import { forEachTrackedItem, forEachTrackedKey, resultIsEmpty, trackingHasKey } from './trackingKeys'
import { addToQueryTracking, createTrackingObject, findTrackedCollection, populateTracking } from './trackingRelations'
import { createVisibleMembership } from './trackingVisible'
import { createVisibleGraphMembership } from './trackingVisibleGraph'

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

/** Live cache view read by the visible ownership effect of a non-collecting query. */
type VisibleSource
  = | { kind: 'none' }
    | { kind: 'keep' }
    | { kind: 'result', result: unknown }
    | { kind: 'graph', result: unknown, include: FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> }

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
    // Collected together on the next tick: one cache commit per collection,
    // instead of one per row that would re-run every dependent query each time.
    const released = new Map<ResolvedCollection<any, any, any>, WrappedItemBase<Collection, CollectionDefaults, StoreSchema>[]>()
    forEachTrackedKey(tracking, (collectionName, key) => {
      if (isTrackedByAnotherPage(collectionName, key)) {
        return
      }
      const collection = findTrackedCollection(store, collectionName)
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
      const items = released.get(collection!) ?? []
      items.push(item)
      released.set(collection!, items)
    })
    if (changed) {
      dataKey.value++
      nextTick(() => {
        for (const [collection, items] of released) {
          store.$cache.garbageCollectItems({ collection, items: items as any })
        }
      })
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

  // Non-collecting queries expose every matching cached row, not only rows
  // returned by their last fetch. Retain that live view once per cache
  // publication, before any synchronous sweep, diffing only changed rows.
  // With includes, each reached row re-reads only its own selected relations.
  const visibleMembership = createVisibleMembership()
  const visibleGraph = createVisibleGraphMembership(store, (change) => {
    if (pageTrackings.get(visiblePageId) === visibleGraph.tracking)
      applyPageChange(visiblePageId, visibleGraph.tracking, change, visibleGraph.tracking, false)
  })
  let visibleResult: unknown
  const stopVisible = watchQueryTracking(store, (): VisibleSource => {
    if (!enabled.value || collecting.value)
      return { kind: 'none' }
    try {
      const result = toValue(options.cached)
      const include = options.include?.()
      return include ? { kind: 'graph', result, include } : { kind: 'result', result }
    }
    catch {
      // A component can invalidate its options immediately before unmount.
      // Keep its last lease until normal query handling or scope disposal.
      return { kind: 'keep' }
    }
  }, reconcileVisible, { immediate: true })

  /** Apply the live cache view to the visible page's ownership. */
  function reconcileVisible(source: VisibleSource): void {
    if (source.kind === 'keep')
      return
    if (source.kind === 'none') {
      releaseVisible()
      return
    }
    const membership = source.kind === 'graph' ? visibleGraph : visibleMembership
    // Leaving one mode hands its full payload to the release below.
    if (source.kind === 'graph')
      visibleMembership.reset()
    else visibleGraph.reset()
    const previous = pageTrackings.get(visiblePageId)
    // Cache publications rerun this effect even when the result is unchanged.
    if (source.result === visibleResult && previous === membership.tracking
      && (source.kind === 'result' || visibleGraph.matches(source.include))) {
      return
    }
    visibleResult = source.result
    const change = source.kind === 'graph'
      ? visibleGraph.update(source.result, source.include)
      : visibleMembership.update(source.result)
    applyPageChange(visiblePageId, membership.tracking, change, previous, false)
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

  /** Release the live cache view when ownership is disabled or collecting. */
  function releaseVisible(): void {
    visibleResult = undefined
    visibleMembership.reset()
    visibleGraph.reset()
    const previous = pageTrackings.get(visiblePageId)
    pageTrackings.delete(visiblePageId)
    if (previous)
      releaseMembers(previous, false)
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
        graph.update(visible, include)
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
      if (tracking === visibleMembership.tracking)
        visibleMembership.reset()
      if (tracking === visibleGraph.tracking)
        visibleGraph.reset()
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
      stopVisible()
      visibleGraph.reset()
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
