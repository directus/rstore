import type { OfflinePluginRuntime } from './types'
import { removeLocalStorageItem } from '../localStorage'
import { getMetadataKey, getOfflineDb, isCollectionIncluded } from './metadata'

/**
 * Register the init hook that wipes outdated offline storage when the
 * configured `version` no longer matches the stored one.
 */
export function installVersionCleanupHook(runtime: OfflinePluginRuntime, hook: any) {
  hook('init', async ({ store }: any) => {
    if (!runtime.options.version || runtime.globalMetadata?.version === runtime.options.version) {
      return
    }

    const db = getOfflineDb(runtime)
    for (const collection of store.$collections) {
      if (isCollectionIncluded(runtime, collection)) {
        await db.clearDatabase(collection.name)
        // The per-collection sync metadata must be wiped with the rows: a
        // stale `lastUpdatedAt` would make the next delta sync skip
        // re-downloading the older rows that were just deleted.
        removeLocalStorageItem(getMetadataKey(collection))
      }
    }

    await cleanupQueuedOperations(runtime)
  })
}

/**
 * Apply the ops-queue policy on version change.
 *
 * Queued mutations are user data recorded while offline, so they are kept and
 * replayed by default — with a warning, since they were captured under the
 * previous storage version. Opting into `clearQueueOnVersionChange` drops
 * them instead.
 */
async function cleanupQueuedOperations(runtime: OfflinePluginRuntime): Promise<void> {
  const db = getOfflineDb(runtime)

  if (runtime.options.clearQueueOnVersionChange) {
    await db.clearDatabase(runtime.opsStoreName)
    return
  }

  const queuedOperations = await db.readAllItems(runtime.opsStoreName)
  if (queuedOperations.length > 0) {
    console.warn(`[rstore/offline] ${queuedOperations.length} queued offline operation(s) were recorded before the storage version changed to "${runtime.options.version}" and will be replayed as-is. Pass \`clearQueueOnVersionChange: true\` to drop them on version change instead.`)
  }
}
