import type { ResolvedCollection } from '@rstore/shared'
import type { CreateOfflinePluginOptions, OfflineMetadata, OfflinePluginRuntime } from './types'
import { getLocalStorageItem } from '../localStorage'

/** Create runtime state for the offline plugin. */
export function createOfflineRuntime(options: CreateOfflinePluginOptions): OfflinePluginRuntime {
  const globalMetadataKey = 'rstore-offline-global-metadata'
  return {
    options,
    opsStoreName: 'rstore-offline-ops-queue',
    globalMetadataKey,
    globalMetadata: getLocalStorageItem(globalMetadataKey) as OfflineMetadata | null,
  }
}

/** Return the local-storage metadata key for a collection. */
export function getMetadataKey(collection: ResolvedCollection) {
  return `rstore-offline-metadata-${collection.name}`
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
