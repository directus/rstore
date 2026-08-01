import type { OfflinePluginRuntime } from './types'
import { replayQueuedOperations } from './queuedOperations'
import { pullCollections } from './sync'

/**
 * Register the single ordered `sync` hook of the offline plugin.
 *
 * The ordering is structural on purpose (one orchestrator instead of two
 * separate `sync` hooks relying on registration order):
 *
 * 1. Replay the queued offline mutations, so offline-created items reach the
 *    server first.
 * 2. Pull remote changes — `syncCollection` consumers delete local keys
 *    missing on the server, which would wipe offline-created items had the
 *    pull run before the replay.
 *
 * Overlapping `$sync` calls (e.g. from flaky browser `online` events) share
 * the in-flight run instead of replaying the same queued operations twice.
 */
export function installOfflineSyncHook(runtime: OfflinePluginRuntime, hook: any) {
  hook('sync', (payload: any) => {
    if (!runtime.pendingSync) {
      runtime.pendingSync = runOfflineSync(runtime, payload).finally(() => {
        runtime.pendingSync = undefined
      })
    }
    return runtime.pendingSync
  })
}

/** Run one full offline sync: queue replay, then remote pull. */
async function runOfflineSync(runtime: OfflinePluginRuntime, payload: any): Promise<void> {
  await replayQueuedOperations(runtime, payload.store)
  await pullCollections(runtime, payload)
}
