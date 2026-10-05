import type { FieldTimestamps, FieldTimestampValue } from './crdt'

// Pre-0.9 LWW members of the cache contract, kept as deprecated aliases for one
// minor. `@rstore/vue` maps them onto write metadata and onto the item
// metadata namespaces of `createMultiplayerPlugin()`. Removed in 0.10.

/**
 * A recorded delete.
 *
 * @deprecated Use `Tombstone` and `getTombstone(store, …)` from `@rstore/multiplayer`. Removed in 0.10.
 */
export interface CacheTombstone {
  collection: string
  key: string | number
  deletedAt: FieldTimestampValue
}

/**
 * Read-only view of the tombstones of `createMultiplayerPlugin()`.
 *
 * @deprecated Use `getTombstone(store, …)` and `tombstoneEntries(store)` from `@rstore/multiplayer`. Removed in 0.10.
 */
export interface CacheTombstones {
  get: (collection: string, key: string | number) => CacheTombstone | undefined
  entries: () => IterableIterator<[string, CacheTombstone]>
  size: () => number
}

/** Deprecated stamp argument of `cache.writeItem` and `applyMutation`. */
export interface DeprecatedCacheWriteAliases {
  /**
   * Per-field stamps for field-level LWW merge.
   *
   * @deprecated Pass `metadata: { fieldTimestamps }` and register `createMultiplayerPlugin()`. Removed in 0.10.
   */
  fieldTimestamps?: FieldTimestamps
}

/** Deprecated stamp argument of `cache.deleteItem` and `applyMutation`. */
export interface DeprecatedCacheDeleteAliases {
  /**
   * Causal time of the delete, recorded as a tombstone.
   *
   * @deprecated Pass `metadata: { deletedAt }` and register `createMultiplayerPlugin()`. Removed in 0.10.
   */
  deletedAt?: FieldTimestampValue
}

/** Deprecated LWW methods of the cache, served from `createMultiplayerPlugin()` metadata. */
export interface DeprecatedCacheMethods {
  /**
   * @deprecated Use `getFieldTimestamps(store, collection, key)` from `@rstore/multiplayer`. Removed in 0.10.
   */
  readFieldTimestamps: (params: {
    collectionName: string
    key: string | number
  }) => FieldTimestamps | undefined

  /**
   * @deprecated Use `setFieldTimestamps(store, collection, key, timestamps)` from `@rstore/multiplayer`. Removed in 0.10.
   */
  writeFieldTimestamps: (params: {
    collectionName: string
    key: string | number
    timestamps: FieldTimestamps
  }) => void

  /**
   * @deprecated Use `getTombstone(store, …)` / `tombstoneEntries(store)` from `@rstore/multiplayer`. Removed in 0.10.
   */
  tombstones: CacheTombstones

  /**
   * @deprecated Use `gcTombstones(store, olderThan)` from `@rstore/multiplayer`. Removed in 0.10.
   */
  gcTombstones: (olderThan: FieldTimestampValue) => Array<{ collection: string, key: string | number }>
}
