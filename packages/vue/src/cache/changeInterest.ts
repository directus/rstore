import type { EngineChangeInterest } from '@rstore/core'

const EMPTY_KEYS: ReadonlySet<string> = new Set()

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
  /** Return whether any bridge or cache dependency is active. */
  hasAny: () => boolean
  /** Return whether an exact or broad item dependency is active. */
  wantsItem: (collection: string, key: string) => boolean
  /** Return whether one visible-list dependency is active. */
  wantsList: (collection: string) => boolean
  /** Return whether one opaque index dependency is active. */
  wantsIndex: (dependency: string) => boolean
  /** Return exact item keys retained independently from broad fallback. */
  exactItemKeys: (collection: string) => ReadonlySet<string>
}

/** Create live ref-counted maps without reactive wrappers. */
export function createCacheChangeInterestRegistry(): CacheChangeInterestRegistry {
  const itemKeys = new Map<string, true | ReadonlySet<string>>()
  const lists = new Set<string>()
  const indexes = new Map<string, ReadonlySet<string>>()
  const exactItemSets = new Map<string, Set<string>>()
  const duplicateItems = new Map<string, Map<string, number>>()
  const broadItems = new Set<string>()
  const listCounts = new Map<string, number>()
  const indexSets = new Map<string, Set<string>>()
  const duplicateIndexes = new Map<string, Map<string, number>>()
  const allIndexDependencies = new Set<string>()
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
    let keys = exactItemSets.get(collection)
    let duplicates = duplicateItems.get(collection)
    if (delta === 1) {
      keys ??= new Set<string>()
      exactItemSets.set(collection, keys)
      if (keys.has(id)) {
        duplicates ??= new Map<string, number>()
        duplicateItems.set(collection, duplicates)
        duplicates.set(id, (duplicates.get(id) ?? 1) + 1)
      }
      keys.add(id)
    }
    else if (keys?.has(id)) {
      const count = duplicates?.get(id)
      if (count && count > 2)
        duplicates!.set(id, count - 1)
      else if (count === 2)
        duplicates!.delete(id)
      else keys.delete(id)
    }
    if (duplicates && !duplicates.size)
      duplicateItems.delete(collection)
    if (keys && !keys.size)
      exactItemSets.delete(collection)
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
    let dependencies = indexSets.get(collection)
    let duplicates = duplicateIndexes.get(collection)
    if (delta === 1) {
      dependencies ??= new Set<string>()
      indexSets.set(collection, dependencies)
      if (dependencies.has(dependency)) {
        duplicates ??= new Map<string, number>()
        duplicateIndexes.set(collection, duplicates)
        duplicates.set(dependency, (duplicates.get(dependency) ?? 1) + 1)
      }
      dependencies.add(dependency)
      allIndexDependencies.add(dependency)
    }
    else if (dependencies?.has(dependency)) {
      const count = duplicates?.get(dependency)
      if (count && count > 2) {
        duplicates!.set(dependency, count - 1)
      }
      else if (count === 2) {
        duplicates!.delete(dependency)
      }
      else {
        dependencies.delete(dependency)
        allIndexDependencies.delete(dependency)
      }
    }
    if (duplicates && !duplicates.size)
      duplicateIndexes.delete(collection)
    if (dependencies?.size) {
      indexes.set(collection, dependencies)
    }
    else {
      indexSets.delete(collection)
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
      exactItemSets.clear()
      duplicateItems.clear()
      broadItems.clear()
      listCounts.clear()
      indexSets.clear()
      duplicateIndexes.clear()
      allIndexDependencies.clear()
    },
    hasAny: () => !disposed && Boolean(itemKeys.size || lists.size || indexes.size),
    wantsItem(collection, key) {
      const keys = itemKeys.get(collection)
      return keys === true || Boolean(keys?.has(key))
    },
    wantsList: collection => lists.has(collection),
    wantsIndex: dependency => allIndexDependencies.has(dependency),
    exactItemKeys: collection => exactItemSets.get(collection) ?? EMPTY_KEYS,
  }
}
