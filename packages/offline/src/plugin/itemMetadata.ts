import type { Cache, CacheItemMetadataNamespace } from '@rstore/shared'
import type { OfflinePluginRuntime } from './types'
import { itemMetadataStoreName } from './constants'
import { getOfflineDb, isCollectionIncluded } from './metadata'

/** One persisted entry of a `persist` item metadata namespace. */
interface PersistedItemMetadata {
  namespace: string
  collection: string
  /** Original key, so numeric keys come back as numbers. */
  key: string | number
  value: unknown
}

/** IndexedDB key of one entry. */
function getEntryKey(namespace: string, collection: string, key: string | number): string {
  return `${namespace}:${collection}:${String(key)}`
}

/** Namespaces registered with `persist: true`. */
function getPersistedNamespaces(cache: Cache<any, any>): CacheItemMetadataNamespace[] {
  return cache.itemMetadata.namespaces().filter(namespace => namespace.persist)
}

/**
 * Keys of the rows an `afterCacheWrite` payload touched. `writeItems` reports
 * its `{ key, value }` entries as `result`; single writes report the key.
 */
function getWrittenKeys(collection: any, payload: any): Array<string | number> {
  if (payload.key != null) {
    return [payload.key]
  }
  return (payload.result ?? []).flatMap((entry: any) => {
    const key = entry && 'value' in entry && 'key' in entry ? entry.key : collection.getKey(entry)
    return key == null ? [] : [key]
  })
}

/**
 * Write the current `persist` entries of some rows to IndexedDB (or delete
 * them when gone). The snapshot is taken synchronously; writes are chained so
 * they reach IndexedDB in cache order.
 */
function persistRows(runtime: OfflinePluginRuntime, store: any, collection: any, keys: Array<string | number>) {
  if (!runtime.db || !isCollectionIncluded(runtime, collection)) {
    return
  }
  const namespaces = getPersistedNamespaces(store.$cache)
  if (!namespaces.length || !keys.length) {
    return
  }
  const writes: Array<{ key: string, value: PersistedItemMetadata }> = []
  const deleteKeys: string[] = []
  for (const key of keys) {
    for (const { name } of namespaces) {
      const value = store.$cache.itemMetadata.read(name, collection.name, key)
      const entryKey = getEntryKey(name, collection.name, key)
      if (value === undefined) {
        deleteKeys.push(entryKey)
      }
      else {
        writes.push({ key: entryKey, value: { namespace: name, collection: collection.name, key, value } })
      }
    }
  }
  const db = getOfflineDb(runtime)
  runtime.itemMetadataWrites = (runtime.itemMetadataWrites ?? Promise.resolve())
    .then(() => db.applyChanges(itemMetadataStoreName, { deleteKeys, writes }))
    .catch((error) => {
      console.error('[rstore/offline] Failed to persist item metadata', error)
    })
}

/** Mirror the `persist` item metadata of every written or deleted row to IndexedDB. */
export function installItemMetadataPersistence(runtime: OfflinePluginRuntime, hook: any) {
  hook('afterCacheWrite', (payload: any) => {
    if (payload.operation === 'write') {
      persistRows(runtime, payload.store, payload.collection, getWrittenKeys(payload.collection, payload))
    }
  })

  // Deletes are mirrored once the delete flush is over, so a tombstone written
  // by a later `cacheBeforeDeleteItem` handler is included, even for a row
  // that was not cached (and therefore emits no `afterCacheWrite`).
  hook('cacheBeforeDeleteItem', ({ store, collection, key }: any) => {
    queueMicrotask(() => persistRows(runtime, store, collection, [key]))
  })
}

/**
 * Restore the persisted entries of the namespaces registered with `persist`,
 * once per store, before the persisted rows are loaded. Entries already in the
 * cache (e.g. from SSR hydration) are kept.
 */
export async function restoreItemMetadata(runtime: OfflinePluginRuntime, store: any): Promise<void> {
  if (runtime.itemMetadataRestored) {
    return
  }
  runtime.itemMetadataRestored = true
  const cache: Cache<any, any> = store.$cache
  const persisted = new Set(getPersistedNamespaces(cache).map(namespace => namespace.name))
  if (!persisted.size) {
    return
  }
  const included = new Set(store.$collections.filter((collection: any) => isCollectionIncluded(runtime, collection)).map((collection: any) => collection.name))
  const entries: PersistedItemMetadata[] = await getOfflineDb(runtime).readAllItems(itemMetadataStoreName)
  for (const entry of entries) {
    if (persisted.has(entry.namespace) && included.has(entry.collection) && cache.itemMetadata.read(entry.namespace, entry.collection, entry.key) === undefined) {
      cache.itemMetadata.write(entry.namespace, entry.collection, entry.key, entry.value)
    }
  }
}
