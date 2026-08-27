import type { EngineChangeSet } from '@rstore/core'
import type { ShallowRef } from 'vue'
import { shallowRef } from 'vue'
import { appendSyncError, throwSyncErrors } from './syncErrors'

/** Reactive fallbacks for ownerless and detached cache reads. */
export interface CacheVersionRegistry {
  /** Track broad collection changes for missing or detached items. */
  trackItem: (collection: string) => void
  /** Track one visible-key collection dependency. */
  trackList: (collection: string) => void
  /** Track one opaque exact index dependency. */
  trackIndex: (dependency: string) => void
  /** Publish exact invalidations from one engine operation. */
  flush: (changes: EngineChangeSet) => void
  /** Invalidate all fallback readers after reset. */
  reset: () => void
  /** Release tracked holders and ignore future reads. */
  dispose: () => void
}

/** Create direct shallow-ref maps without reactive object proxy reads. */
export function createCacheVersionRegistry(): CacheVersionRegistry {
  const itemVersions = new Map<string, ShallowRef<number>>()
  const listVersions = new Map<string, ShallowRef<number>>()
  const indexVersions = new Map<string, ShallowRef<number>>()
  const resetVersion = shallowRef(0)
  let disposed = false

  /** Read one dependency holder and shared reset holder. */
  function track(versions: Map<string, ShallowRef<number>>, id: string): void {
    if (disposed)
      return
    const holder = versions.get(id) ?? shallowRef(0)
    versions.set(id, holder)
    // eslint-disable-next-line ts/no-unused-expressions
    resetVersion.value
    // eslint-disable-next-line ts/no-unused-expressions
    holder.value
  }

  /** Increment a holder only when an ownerless reader created it. */
  function touch(versions: Map<string, ShallowRef<number>>, id: string): void {
    const holder = versions.get(id)
    if (!disposed && holder)
      holder.value++
  }

  return {
    trackItem: collection => track(itemVersions, collection),
    trackList: collection => track(listVersions, collection),
    trackIndex: dependency => track(indexVersions, dependency),
    flush(changes) {
      let errors: unknown[] | undefined
      if (itemVersions.size) {
        for (const collection of changes.items.keys()) {
          try {
            touch(itemVersions, collection)
          }
          catch (error) {
            errors = appendSyncError(errors, error)
          }
        }
      }
      if (listVersions.size) {
        for (const collection of changes.lists) {
          try {
            touch(listVersions, collection)
          }
          catch (error) {
            errors = appendSyncError(errors, error)
          }
        }
      }
      if (indexVersions.size) {
        for (const dependency of changes.indexes) {
          try {
            touch(indexVersions, dependency)
          }
          catch (error) {
            errors = appendSyncError(errors, error)
          }
        }
      }
      throwSyncErrors(errors, 'Fallback version synchronization failed')
    },
    reset() {
      if (!disposed)
        resetVersion.value++
    },
    dispose() {
      disposed = true
      itemVersions.clear()
      listVersions.clear()
      indexVersions.clear()
    },
  }
}
