import type { CreateOfflinePluginOptions } from './types'
import { definePlugin } from '@rstore/core'
import { useIndexedDb } from '../indexeddb'
import { createOfflineRuntime } from './metadata'
import { installMutationHooks } from './mutations'
import { installQueuedOperationSyncHook } from './queuedOperations'
import { installReconnectHook } from './reconnect'
import { installSyncHooks } from './sync'

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

      installSyncHooks(runtime, hook)
      installMutationHooks(runtime, hook)
      installQueuedOperationSyncHook(runtime, hook)
      installReconnectHook(hook)
    },
  })
}
