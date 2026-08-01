import type { CollectionDefaults, CustomHookMeta, StoreCore, StoreSchema } from '@rstore/shared'

/**
 * localStorage key used to persist the date of the last successful sync.
 */
export const lastSyncStorageKey = 'rstore-last-sync-at'

/**
 * Read the persisted date of the last successful sync (browser contexts only).
 */
export function getLastSyncedAt(): Date | undefined {
  if (typeof window !== 'undefined') {
    const timestamp = window.localStorage.getItem(lastSyncStorageKey)
    if (timestamp) {
      // Support both ISO strings (current format) and legacy epoch-ms values
      const date = new Date(/^\d+$/.test(timestamp) ? Number(timestamp) : timestamp)
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }
  }
}

/**
 * Create the `$sync` function of a store.
 *
 * The returned function is guarded against re-entrancy: calling it while a
 * sync is already running returns the in-flight promise instead of starting
 * a second concurrent sync.
 *
 * @param getStore Accessor returning the store (the store object may be replaced by `transformStore`).
 */
export function createSync<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>(getStore: () => StoreCore<TSchema, TCollectionDefaults>): () => Promise<void> {
  let currentSyncPromise: Promise<void> | undefined

  /**
   * Run the sync callbacks and update the sync state.
   */
  async function runSync(): Promise<void> {
    const store = getStore()
    store.$syncState.isSyncing = true
    store.$syncState.error = undefined
    store.$syncState.loadedCollections.clear()
    store.$syncState.syncedCollections.clear()
    try {
      const meta: CustomHookMeta = {}

      await store.$hooks.callHookWith('sync', async (callbacks) => {
        let globalProgress = 0
        for (const { callback } of callbacks) {
          let callbackProgress = 0
          await callback({
            store: store as any,
            meta,
            setProgress: ({ percent, message }) => {
              callbackProgress = percent
              store.$syncState.progress = globalProgress + (callbackProgress / callbacks.length)
              store.$syncState.progressMessage = message
            },
            setCollectionLoaded: (collectionName) => {
              store.$syncState.loadedCollections.add(collectionName)
            },
            setCollectionSynced: (collectionName) => {
              store.$syncState.syncedCollections.add(collectionName)
            },
          })
          globalProgress += 1 / callbacks.length
          store.$syncState.progress = globalProgress
        }
      })

      store.$syncState.lastSyncAt = new Date()
      // Persisting is only possible in browser contexts
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(lastSyncStorageKey, store.$syncState.lastSyncAt.toISOString())
      }
    }
    catch (error) {
      store.$syncState.error = error as Error
    }
    finally {
      store.$syncState.isSyncing = false
    }
  }

  return () => {
    // Re-entrancy guard: return the in-flight sync instead of starting another
    if (currentSyncPromise) {
      return currentSyncPromise
    }
    currentSyncPromise = runSync().finally(() => {
      currentSyncPromise = undefined
    })
    return currentSyncPromise
  }
}
