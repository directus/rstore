import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { VueStore } from '../store'
import type { VueQueryPage } from './types'
import { createTrackingObject, populateTracking, resolveNestedInclude } from '../trackingRelations'
import { isCurrentPageRequest } from './page'

/** Include tree of a query's find options. */
type Include = FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>

/** What one page contributes to the kept keys of a prune. */
interface PruneRecord {
  /** Identities written to the cache by the page fetch. */
  tracking: HookMetaQueryTracking
  /** Result exposed by the page, traversed for its included relations. */
  result: unknown
  /** Include tree of the page options. */
  include: Include | undefined
}

/** Bookkeeping of one `refresh({ prune: true })`. */
export interface PruneRun {
  /** Contributions of the successfully fetched pages, and of the pages left out. */
  records: PruneRecord[]
  /** Pages the refresh reloads, with the request id each load has to stay on. */
  loads: Array<{ page: VueQueryPage<any, any, any, any, any>, requestId: string }>
  /** Number of reloaded pages that fetched successfully. */
  fetched: number
}

/** Start the bookkeeping of a pruning refresh. */
export function createPruneRun(): PruneRun {
  return { records: [], loads: [], fetched: 0 }
}

/** Register a page the refresh is about to reload. No-op for a refresh that does not prune. */
export function addPrunedLoad(run: PruneRun | undefined, page: VueQueryPage<any, any, any, any, any>): void {
  run?.loads.push({ page, requestId: page.requestId })
}

/**
 * Register a successfully fetched page result.
 *
 * @param run Bookkeeping of the refresh.
 * @param tracking Identities the fetch wrote to the cache.
 * @param result Result returned by the fetch.
 * @param include Include tree of the page options.
 * @param shared Whether `tracking` is also the page ownership. Ownership then
 * adopts the visible page rows, which a cache-computed page still mixes with
 * stale ones, so the written identities are captured before that happens.
 */
export function recordPrunedFetch(run: PruneRun, tracking: HookMetaQueryTracking, result: unknown, include: Include | undefined, shared: boolean): void {
  run.records.push({ tracking: shared ? copyTracking(tracking) : tracking, result, include })
  run.fetched++
}

/**
 * Register a page the refresh leaves out: its current rows stay in the query.
 * No-op for a refresh that does not prune.
 */
export function recordKeptPage(ctx: any, run: PruneRun | undefined, page: VueQueryPage<any, any, any, any, any>): void {
  // The getter defers the read until the prune runs, after queued writes.
  run?.records.push({
    tracking: createTrackingObject(),
    get result() {
      return page.data
    },
    include: ctx.getPageOptions(page).include,
  })
}

/**
 * Queue the deletion of every item of the query collection and of its included
 * relation collections that the refreshed result does not hold.
 *
 * Nothing is pruned unless every reloaded page fetched successfully: a partial
 * result must never delete valid rows.
 */
export function applyPrune(ctx: any, run: PruneRun | undefined): void {
  if (!run?.loads.length || run.fetched !== run.loads.length) {
    return
  }
  const store = ctx.store as VueStore
  const collection = ctx.getCollection() as ResolvedCollection
  const collections = new Set<string>()
  for (const record of run.records) {
    collectIncludedCollections(store, collection, record.include, collections)
  }
  ctx.cache._private.prune({
    collections: Array.from(collections),
    // A later load of a page supersedes this refresh, whose result is then no longer the reference.
    canApply: () => run.loads.every(({ page, requestId }) => isCurrentPageRequest(ctx, page, requestId)),
    getKeptKeys: () => getKeptKeys(store, run.records),
  })
}

/** Merge the identities of every record, following included relations through the cache. */
function getKeptKeys(store: VueStore, records: PruneRecord[]): Map<string, Set<string>> {
  const kept = new Map<string, Set<string>>()
  // Every record owns its tracking payload, so it can grow in place.
  for (const { tracking, result, include } of records) {
    populateTracking(store, tracking, result, include)
    for (const [collectionName, keys] of Object.entries(tracking.items)) {
      let set = kept.get(collectionName)
      if (!set) {
        kept.set(collectionName, set = new Set())
      }
      for (const key of keys) {
        set.add(String(key))
      }
    }
  }
  return kept
}

/**
 * Copy the identities of a tracking payload, so neither side sees what the other adds.
 * Included relations are only read once the fetch settled, so they are shared.
 */
function copyTracking(tracking: HookMetaQueryTracking): HookMetaQueryTracking {
  return {
    items: Object.fromEntries(Object.entries(tracking.items).map(([name, keys]) => [name, new Set(keys)])),
    includedRelations: tracking.includedRelations,
  }
}

/**
 * Add a collection and every relation target selected by `include`, recursively.
 * `visited` guards against cyclic relations selected by the same include object.
 */
function collectIncludedCollections(
  store: VueStore,
  collection: ResolvedCollection,
  include: Include | undefined,
  result: Set<string>,
  visited = new Map<string, Set<Include | undefined>>(),
): void {
  result.add(collection.name)
  const selections = visited.get(collection.name) ?? new Set<Include | undefined>()
  if (selections.has(include)) {
    return
  }
  selections.add(include)
  visited.set(collection.name, selections)
  if (!include) {
    return
  }
  for (const relationName in collection.normalizedRelations) {
    const relationInclude = include[relationName as keyof Include]
    if (!relationInclude) {
      continue
    }
    for (const target of collection.normalizedRelations[relationName]!.to) {
      const targetCollection = store.$collections.find(candidate => candidate.name === target.collection)
      if (targetCollection) {
        collectIncludedCollections(store, targetCollection, resolveNestedInclude(targetCollection.relations, relationInclude), result, visited)
      }
    }
  }
}
