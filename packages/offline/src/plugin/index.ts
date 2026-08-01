import type { CreateOfflinePluginOptions } from './types'
import { definePlugin } from '@rstore/core'
import { useIndexedDb } from '../indexeddb'
import { createOfflineRuntime } from './metadata'
import { installMutationHooks } from './mutations'
import { installReconnectHook } from './reconnect'
import { installOfflineSyncHook } from './syncOrchestrator'
import { installVersionCleanupHook } from './versionCleanup'

export type { CreateOfflinePluginOptions } from './types'

/** Create the offline persistence and queued mutation plugin. */
export function createOfflinePlugin(options: CreateOfflinePluginOptions = {}) {
  return definePlugin({
    name: 'offline',
    category: 'local',
    setup({ hook }) {
      if (typeof window === 'undefined') {
        return
      }

      const runtime = createOfflineRuntime(options)
      hook('init', async () => {
        runtime.db = await useIndexedDb(options.dbName || 'rstore-offline')
      })

      installVersionCleanupHook(runtime, hook)
      installMutationHooks(runtime, hook)
      // Single ordered `sync` hook: queue replay first, then remote pull.
      installOfflineSyncHook(runtime, hook)
      installReconnectHook(hook)
    },
  })
}
