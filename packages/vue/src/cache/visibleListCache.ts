import type { WrappedItem } from '@rstore/shared'
import type { CacheChangeInterestRegistry } from './changeInterest'
import type { ItemCell } from './itemCells'

/** Wrappers of one collection's visible rows, in engine order. */
export interface VisibleListEntry {
  /** Wrapped rows returned to readers (copied on every read). */
  items: Array<WrappedItem<any, any, any>>
  /** Canonical engine id of each row. */
  ids: string[]
  /** Reactive source of each row's wrapper, detached once it is evicted. */
  cells: ItemCell[]
  /** Marker the list was last read with. */
  marker?: string
}

/** Visible-list results that stay valid while their membership interest is held. */
export interface VisibleListCache {
  /** Return the current list of a collection. */
  get: (collection: string) => VisibleListEntry | undefined
  /** Store a freshly built list and retain list invalidation for it. */
  set: (collection: string, entry: VisibleListEntry) => void
  /** Turn the current list into a snapshot the next rebuild can reuse rows from. */
  invalidate: (collection: string) => void
  /** Take and forget a collection's reusable snapshot. */
  takeSnapshot: (collection: string) => VisibleListEntry | undefined
  /** Forget a collection's list and snapshot, e.g. after a reset or a layer change. */
  drop: (collection: string) => void
  /** Forget every list and snapshot. */
  clear: () => void
}

/**
 * Create the visible-list cache. Like exact index results, each cached list
 * holds its own list interest, so membership changes are recorded even after
 * every reactive reader stopped and a later reader never sees a stale list.
 */
export function createVisibleListCache(interest: CacheChangeInterestRegistry): VisibleListCache {
  const lists = new Map<string, VisibleListEntry>()
  const snapshots = new Map<string, VisibleListEntry>()

  /** Remove one current list and release its interest. */
  function take(collection: string): VisibleListEntry | undefined {
    const entry = lists.get(collection)
    if (entry) {
      lists.delete(collection)
      interest.releaseList(collection)
    }
    return entry
  }

  return {
    get: collection => lists.get(collection),
    set(collection, entry) {
      if (!lists.has(collection))
        interest.retainList(collection)
      lists.set(collection, entry)
      snapshots.delete(collection)
    },
    invalidate(collection) {
      const entry = take(collection)
      if (entry)
        snapshots.set(collection, entry)
    },
    takeSnapshot(collection) {
      const entry = snapshots.get(collection)
      snapshots.delete(collection)
      return entry
    },
    drop(collection) {
      take(collection)
      snapshots.delete(collection)
    },
    clear() {
      for (const collection of Array.from(lists.keys())) take(collection)
      snapshots.clear()
    },
  }
}
