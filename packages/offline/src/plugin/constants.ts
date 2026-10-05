/** IndexedDB store that holds pending offline mutations. */
export const offlineOpsStoreName = 'rstore-offline-ops-queue'

/** Return the localStorage key for one collection's pull cursor. */
export function getCollectionMetadataKey(collectionName: string): string {
  return `rstore-offline-metadata-${collectionName}`
}

/** IndexedDB store that mirrors the `persist` item metadata namespaces of the cache. */
export const itemMetadataStoreName = 'rstore-offline-item-metadata'
