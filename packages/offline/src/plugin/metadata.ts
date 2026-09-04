import type { ResolvedCollection } from '@rstore/shared'
import type { CreateOfflinePluginOptions, OfflineMetadata, OfflinePluginRuntime } from './types'
import { getLocalStorageItem } from '../localStorage'
import { getCollectionMetadataKey, offlineOpsStoreName } from './constants'

/** Create runtime state for the offline plugin. */
export function createOfflineRuntime(options: CreateOfflinePluginOptions): OfflinePluginRuntime {
  const globalMetadataKey = 'rstore-offline-global-metadata'
  return {
    options,
    opsStoreName: offlineOpsStoreName,
    globalMetadataKey,
    globalMetadata: getLocalStorageItem(globalMetadataKey) as OfflineMetadata | null,
  }
}

/** Return the local-storage metadata key for a collection. */
export function getMetadataKey(collection: ResolvedCollection) {
  return getCollectionMetadataKey(collection.name)
}

/** Whether a collection should be handled by the offline plugin. */
export function isCollectionIncluded(runtime: OfflinePluginRuntime, collection: ResolvedCollection): boolean {
  return runtime.options.filterCollection ? runtime.options.filterCollection(collection) : true
}

/** Return the initialized IndexedDB helper or fail loudly. */
export function getOfflineDb(runtime: OfflinePluginRuntime) {
  if (!runtime.db) {
    throw new Error('[rstore/offline] IndexedDB has not been initialized yet.')
  }
  return runtime.db
}
