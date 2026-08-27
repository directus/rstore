import type { EngineChangeInterest } from '@rstore/core'

/** Ref-counted dependencies exposed to Core's selective change recorder. */
export interface CacheChangeInterestRegistry {
  /** Live interest object read by StoreEngine before each operation. */
  value: EngineChangeInterest
  /** Retain one exact item dependency. */
  retainItem: (collection: string, key: string | number) => void
  /** Release one exact item dependency. */
  releaseItem: (collection: string, key: string | number) => void
  /** Retain broad item fallback for a collection. */
  retainItemCollection: (collection: string) => void
  /** Release broad item fallback for a collection. */
  releaseItemCollection: (collection: string) => void
  /** Retain one visible-list dependency. */
  retainList: (collection: string) => void
  /** Release one visible-list dependency. */
  releaseList: (collection: string) => void
  /** Retain one opaque index dependency. */
  retainIndex: (collection: string, dependency: string) => void
  /** Release one opaque index dependency. */
  releaseIndex: (collection: string, dependency: string) => void
  /** Release every interest. */
  dispose: () => void
}

/** Create live ref-counted maps without reactive wrappers. */
export function createCacheChangeInterestRegistry(): CacheChangeInterestRegistry {
  const itemKeys = new Map<string, true | ReadonlySet<string>>()
  const lists = new Set<string>()
  const indexes = new Map<string, ReadonlySet<string>>()
  const exactItems = new Map<string, Map<string, number>>()
  const exactItemSets = new Map<string, Set<string>>()
  const broadItems = new Set<string>()
  const listCounts = new Map<string, number>()
  const indexCounts = new Map<string, Map<string, number>>()
  const indexSets = new Map<string, Set<string>>()
  let disposed = false

  /** Refresh public exact-item view after one count changes. */
  function refreshItems(collection: string): void {
    if (broadItems.has(collection)) {
      itemKeys.set(collection, true)
      return
    }
    const keys = exactItemSets.get(collection)
    if (keys?.size)
      itemKeys.set(collection, keys)
    else itemKeys.delete(collection)
  }

  /** Change one exact item reference count. */
  function changeItem(collection: string, key: string | number, delta: 1 | -1): void {
    if (disposed)
      return
    const id = String(key)
    const counts = exactItems.get(collection) ?? new Map<string, number>()
    const keys = exactItemSets.get(collection) ?? new Set<string>()
    const next = (counts.get(id) ?? 0) + delta
    if (next > 0) {
      counts.set(id, next)
      keys.add(id)
    }
    else {
      counts.delete(id)
      keys.delete(id)
    }
    // Keep empty containers for hot synchronous watcher cleanup/rerun reuse.
    exactItems.set(collection, counts)
    exactItemSets.set(collection, keys)
    refreshItems(collection)
  }

  /** Change one list reference count. */
  function changeList(collection: string, delta: 1 | -1): void {
    if (disposed)
      return
    const next = (listCounts.get(collection) ?? 0) + delta
    if (next > 0) {
      listCounts.set(collection, next)
      lists.add(collection)
    }
    else {
      listCounts.delete(collection)
      lists.delete(collection)
    }
  }

  /** Change one index reference count. */
  function changeIndex(collection: string, dependency: string, delta: 1 | -1): void {
    if (disposed)
      return
    const counts = indexCounts.get(collection) ?? new Map<string, number>()
    const dependencies = indexSets.get(collection) ?? new Set<string>()
    const next = (counts.get(dependency) ?? 0) + delta
    if (next > 0) {
      counts.set(dependency, next)
      dependencies.add(dependency)
    }
    else {
      counts.delete(dependency)
      dependencies.delete(dependency)
    }
    indexCounts.set(collection, counts)
    indexSets.set(collection, dependencies)
    if (counts.size) {
      indexes.set(collection, dependencies)
    }
    else {
      indexes.delete(collection)
    }
  }

  return {
    value: { itemKeys, lists, indexes },
    retainItem: (collection, key) => changeItem(collection, key, 1),
    releaseItem: (collection, key) => changeItem(collection, key, -1),
    retainItemCollection(collection) {
      if (!disposed && !broadItems.has(collection)) {
        broadItems.add(collection)
        refreshItems(collection)
      }
    },
    releaseItemCollection(collection) {
      if (!disposed && broadItems.delete(collection))
        refreshItems(collection)
    },
    retainList: collection => changeList(collection, 1),
    releaseList: collection => changeList(collection, -1),
    retainIndex: (collection, dependency) => changeIndex(collection, dependency, 1),
    releaseIndex: (collection, dependency) => changeIndex(collection, dependency, -1),
    dispose() {
      disposed = true
      itemKeys.clear()
      lists.clear()
      indexes.clear()
      exactItems.clear()
      exactItemSets.clear()
      broadItems.clear()
      listCounts.clear()
      indexCounts.clear()
      indexSets.clear()
    },
  }
}
