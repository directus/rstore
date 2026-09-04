import type { OfflineQueuedOperation } from './plugin/types'
import { useIndexedDb } from './indexeddb'
import { removeLocalStorageItem } from './localStorage'
import { getCollectionMetadataKey, offlineOpsStoreName } from './plugin/constants'

/** One queued operation returned by public offline storage APIs. */
export type QueuedOp = OfflineQueuedOperation

/** Public lifecycle and cleanup controls for one offline database prefix. */
export interface OfflineStorage {
  /** Read queued mutations in replay order. */
  readQueue: () => Promise<QueuedOp[]>
  /** Permanently remove every queued mutation. */
  clearQueue: () => Promise<void>
  /** Permanently remove rows from selected collection mirrors. */
  clearCollections: (names: string[]) => Promise<void>
  /** Remove pull cursors from selected collections. */
  clearMetadata: (names: string[]) => Promise<void>
  /** Release this storage handle's IndexedDB connections. */
  dispose: () => void
}

/**
 * Open public storage controls for an offline database prefix.
 *
 * This hides the IndexedDB and localStorage naming layout from consumers.
 */
export async function useOfflineStorage(dbName = 'rstore-offline'): Promise<OfflineStorage> {
  const db = await useIndexedDb(dbName)
  return {
    async readQueue() {
      const queue = await db.readAllItems(offlineOpsStoreName) as QueuedOp[]
      return queue.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    },
    clearQueue: () => db.clearDatabase(offlineOpsStoreName),
    clearCollections: async (names) => {
      await Promise.all(names.map(name => db.clearDatabase(name)))
    },
    clearMetadata: async (names) => {
      for (const name of names) {
        removeLocalStorageItem(getCollectionMetadataKey(name))
      }
    },
    dispose: db.dispose,
  }
}
