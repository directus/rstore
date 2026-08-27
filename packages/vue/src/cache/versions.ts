import type { ObserverChanges } from '@rstore/core'
import { shallowReactive, shallowRef } from 'vue'

/** Reactive fallback versions for Vue computed getters without a watcher owner. */
export interface CacheVersionRegistry {
  /** Track one item value through its collection version. */
  trackItem: (collection: string) => void
  /** Track one visible-key collection version. */
  trackList: (collection: string) => void
  /** Track one index bucket through its collection index version. */
  trackIndex: (collection: string) => void
  /** Publish the exact invalidations from an engine observer flush. */
  flush: (changes: ObserverChanges) => void
  /** Invalidate all fallback readers after a cache reset. */
  reset: () => void
}

/** Create tiny per-collection reactive versions without engine subscriptions. */
export function createCacheVersionRegistry(): CacheVersionRegistry {
  const itemVersions = shallowReactive<Record<string, number>>({})
  const listVersions = shallowReactive<Record<string, number>>({})
  const indexVersions = shallowReactive<Record<string, number>>({})
  const resetVersion = shallowRef(0)

  /** Read a collection version, creating its small holder on first access. */
  function track(versions: Record<string, number>, collection: string): void {
    versions[collection] ??= 0
    // eslint-disable-next-line ts/no-unused-expressions
    resetVersion.value
    // eslint-disable-next-line ts/no-unused-expressions
    versions[collection]
  }

  /** Increment a tracked version without allocating data-key-specific state. */
  function touch(versions: Record<string, number>, collection: string): void {
    if (collection in versions) {
      versions[collection] = (versions[collection] ?? 0) + 1
    }
  }

  return {
    trackItem: collection => track(itemVersions, collection),
    trackList: collection => track(listVersions, collection),
    trackIndex: collection => track(indexVersions, collection),
    flush(changes) {
      for (const collection of changes.items.keys()) {
        touch(itemVersions, collection)
      }
      for (const collection of changes.lists) {
        touch(listVersions, collection)
      }
      for (const collection of changes.indexes.keys()) {
        touch(indexVersions, collection)
      }
    },
    reset() {
      resetVersion.value++
    },
  }
}
