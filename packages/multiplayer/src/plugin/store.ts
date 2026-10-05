import type { Cache, FieldTimestamps, FieldTimestampValue } from '@rstore/shared'
import type { Tombstone, TombstoneStore } from '../lww/index.js'
import { compareHLC } from '../clock/index.js'
import { gcTombstones as gcTombstoneStore, tombstoneKey } from '../lww/index.js'

/** `cache.itemMetadata` namespace of field stamps (removed with the row). */
export const FIELD_TIMESTAMPS_NAMESPACE = 'multiplayer:fields'

/** `cache.itemMetadata` namespace of delete tombstones (survives the row). */
export const TOMBSTONE_NAMESPACE = 'multiplayer:tombstone'

/** Anything exposing the rstore cache, such as a store. */
export interface MultiplayerStoreLike {
  $cache: Cache<any, any>
}

/** Value stored in the {@link TOMBSTONE_NAMESPACE} namespace. */
interface StoredTombstone {
  deletedAt: FieldTimestampValue
}

/**
 * Declare both multiplayer namespaces on a cache. Idempotent. They are
 * `persist` namespaces, so storage plugins such as `@rstore/offline` keep
 * stamps and tombstones across reloads.
 */
export function registerMultiplayerNamespaces(cache: Cache<any, any>): void {
  cache.itemMetadata.register(FIELD_TIMESTAMPS_NAMESPACE, { lifecycle: 'item', persist: true })
  cache.itemMetadata.register(TOMBSTONE_NAMESPACE, { lifecycle: 'detached', persist: true })
}

/**
 * Read the field stamps stored for an item by `createMultiplayerPlugin()`.
 *
 * @param store Store using the plugin.
 * @param collection Collection name.
 * @param key Item key.
 */
export function getFieldTimestamps(store: MultiplayerStoreLike, collection: string, key: string | number): FieldTimestamps | undefined {
  return store.$cache.itemMetadata.read<FieldTimestamps>(FIELD_TIMESTAMPS_NAMESPACE, collection, key)
}

/**
 * Replace the field stamps stored for an item. Throws when the store does not
 * use `createMultiplayerPlugin()`.
 *
 * @param store Store using the plugin.
 * @param collection Collection name.
 * @param key Item key.
 * @param timestamps New stamps; copied.
 */
export function setFieldTimestamps(store: MultiplayerStoreLike, collection: string, key: string | number, timestamps: FieldTimestamps): void {
  store.$cache.itemMetadata.write(FIELD_TIMESTAMPS_NAMESPACE, collection, key, { ...timestamps })
}

/**
 * Read the tombstone of a deleted item.
 *
 * @param store Store using the plugin.
 * @param collection Collection name.
 * @param key Item key.
 */
export function getTombstone(store: MultiplayerStoreLike, collection: string, key: string | number): Tombstone | undefined {
  return createTombstoneView(store.$cache).get(collection, key)
}

/**
 * Iterate every tombstone of a store.
 *
 * @param store Store using the plugin.
 */
export function* tombstoneEntries(store: MultiplayerStoreLike): IterableIterator<Tombstone> {
  for (const [, tombstone] of createTombstoneView(store.$cache).entries()) {
    yield tombstone
  }
}

/**
 * Drop the tombstones of a store whose `deletedAt` is older than `olderThan`.
 *
 * @param store Store using the plugin.
 * @param olderThan Cutoff stamp (HLC string or legacy number).
 * @returns The removed tombstones' identifiers.
 */
export function gcTombstones(store: MultiplayerStoreLike, olderThan: FieldTimestampValue): Array<{ collection: string, key: string | number }> {
  return gcTombstoneStore(createTombstoneView(store.$cache), olderThan)
}

/**
 * A `TombstoneStore` over the cache's tombstone namespace, so the pure
 * `/lww` helpers (`gcTombstones`, `scheduleTombstoneGc`) run on cache data.
 * `set` keeps the later of two deletes, like `createTombstoneStore()`.
 *
 * @param cache Cache whose namespaces are registered.
 */
export function createTombstoneView(cache: Cache<any, any>): TombstoneStore {
  const metadata = cache.itemMetadata
  const read = (collection: string, key: string | number) => metadata.read<StoredTombstone>(TOMBSTONE_NAMESPACE, collection, key)
  return {
    get(collection, key) {
      const stored = read(collection, key)
      return stored && { collection, key, deletedAt: stored.deletedAt }
    },
    set({ collection, key, deletedAt }) {
      const existing = read(collection, key)
      if (existing && compareHLC(existing.deletedAt, deletedAt) >= 0) {
        return
      }
      metadata.write<StoredTombstone>(TOMBSTONE_NAMESPACE, collection, key, { deletedAt })
    },
    clear(collection, key) {
      metadata.delete(TOMBSTONE_NAMESPACE, collection, key)
    },
    * entries() {
      // Snapshot first: callers such as `gcTombstones` clear while iterating.
      for (const entry of Array.from(metadata.entries<StoredTombstone>(TOMBSTONE_NAMESPACE))) {
        yield [tombstoneKey(entry.collection, entry.key), { collection: entry.collection, key: entry.key, deletedAt: entry.value.deletedAt }]
      }
    },
    size() {
      return metadata.size(TOMBSTONE_NAMESPACE)
    },
  }
}
