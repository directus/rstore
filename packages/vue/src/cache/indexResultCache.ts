import type { CacheChangeInterestRegistry } from './changeInterest'

const MAX_ENTRIES = 128
const MAX_WRAPPER_REFERENCES = 20_000
const MAX_STRONG_ENTRIES = 4
const MAX_STRONG_WRAPPER_REFERENCES = 1_024
const MIN_CACHEABLE_WRAPPERS = 8

/** Bounded exact-index wrapper result cache with Core interest ownership. */
export interface IndexResultCache {
  /** Return cache-owned wrappers and refresh LRU order. */
  get: (dependency: string) => readonly any[] | undefined
  /** Store wrappers and report whether caller must return a defensive copy. */
  set: (collection: string, dependency: string, items: any[]) => boolean
  /** Drop one dependency before reactive readers rerun. */
  invalidate: (dependency: string) => void
  /** Drop one collection or every cached dependency. */
  reset: (collection?: string) => void
  /** Release all Core interests. */
  dispose: () => void
  /** Return bounded-cache diagnostics for tests and benchmarks. */
  size: () => { entries: number, wrapperReferences: number }
}

/** Create one LRU cache retaining exact index invalidation interests. */
export function createIndexResultCache(interest: CacheChangeInterestRegistry): IndexResultCache {
  const entries = new Map<string, { collection: string, items: WeakRef<any[]>, strong?: any[], length: number }>()
  let wrapperReferences = 0
  let strongEntries = 0
  let strongWrapperReferences = 0
  let hotDependency: string | undefined
  let hotItems: any[] | undefined

  /** Delete one entry and release its selective Core dependency. */
  function remove(dependency: string): void {
    const entry = entries.get(dependency)
    if (!entry)
      return
    entries.delete(dependency)
    if (hotDependency === dependency) {
      hotDependency = undefined
      hotItems = undefined
    }
    wrapperReferences -= entry.length
    if (entry.strong) {
      strongEntries--
      strongWrapperReferences -= entry.length
    }
    interest.releaseIndex(entry.collection, dependency)
  }

  /** Keep only tiny most-recent results strongly reachable between collections. */
  function pruneStrong(): void {
    for (const [dependency, entry] of entries) {
      if (strongEntries <= MAX_STRONG_ENTRIES && strongWrapperReferences <= MAX_STRONG_WRAPPER_REFERENCES)
        return
      if (entry.strong) {
        entry.strong = undefined
        if (hotDependency === dependency) {
          hotDependency = undefined
          hotItems = undefined
        }
        strongEntries--
        strongWrapperReferences -= entry.length
      }
    }
  }

  /** Enforce both entry and retained-wrapper budgets using oldest entries. */
  function prune(): void {
    while (entries.size > MAX_ENTRIES || wrapperReferences > MAX_WRAPPER_REFERENCES) {
      const oldest = entries.keys().next().value as string | undefined
      if (oldest === undefined)
        break
      remove(oldest)
    }
  }

  return {
    get(dependency) {
      if (dependency === hotDependency)
        return hotItems
      const entry = entries.get(dependency)
      if (!entry)
        return undefined
      const items = entry.strong ?? entry.items.deref()
      if (!items) {
        remove(dependency)
        return undefined
      }
      entries.delete(dependency)
      entries.set(dependency, entry)
      if (!entry.strong) {
        entry.strong = items
        strongEntries++
        strongWrapperReferences += entry.length
        pruneStrong()
      }
      if (entry.strong) {
        hotDependency = dependency
        hotItems = items
      }
      return items
    },
    set(collection, dependency, items) {
      remove(dependency)
      // Tiny buckets cost less to rescan than cache ownership churn during
      // alternating membership writes and relation watcher reruns.
      if (items.length < MIN_CACHEABLE_WRAPPERS || items.length > MAX_WRAPPER_REFERENCES)
        return false
      entries.set(dependency, { collection, items: new WeakRef(items), strong: items, length: items.length })
      wrapperReferences += items.length
      strongEntries++
      strongWrapperReferences += items.length
      pruneStrong()
      if (entries.get(dependency)?.strong) {
        hotDependency = dependency
        hotItems = items
      }
      interest.retainIndex(collection, dependency)
      prune()
      return entries.has(dependency)
    },
    invalidate: remove,
    reset(collection) {
      for (const [dependency, entry] of [...entries]) {
        if (collection === undefined || entry.collection === collection)
          remove(dependency)
      }
    },
    dispose() {
      for (const dependency of [...entries.keys()]) remove(dependency)
    },
    size: () => ({ entries: entries.size, wrapperReferences }),
  }
}
