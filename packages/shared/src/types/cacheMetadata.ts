/**
 * Per-write data forwarded untouched from mutations and connectors to cache
 * hooks (`cacheBeforeWriteItem`, `cacheBeforeDeleteItem`). The cache never
 * reads it. Plugins augment this interface with the keys they handle:
 *
 * ```ts
 * declare module '@rstore/shared' {
 *   interface CustomCacheWriteMetadata {
 *     etag?: string
 *   }
 * }
 * ```
 */
export interface CustomCacheWriteMetadata {}

/**
 * Lifecycle of an item metadata namespace relative to the cache row it describes.
 *
 * - `item`: removed with the row (delete, eviction/GC, prune, `clear`, `clearCollection`).
 * - `detached`: survives deletion and eviction of the row; removed only by
 *   `clear`, `clearCollection` or an explicit `delete`.
 */
export type CacheItemMetadataLifecycle = 'item' | 'detached'

/** Options of an item metadata namespace, fixed when it is registered. */
export interface CacheItemMetadataNamespaceOptions {
  /** When entries of this namespace are removed. */
  lifecycle: CacheItemMetadataLifecycle
  /**
   * Include the namespace in `getState()` and restore it in `setState()`.
   * Values must then survive the SSR transport (JSON/devalue/structuredClone).
   * @default true
   */
  serialize?: boolean
  /**
   * Let storage plugins (such as `@rstore/offline`) persist the entries of
   * rows they persist, and restore them on the next load. Values must then be
   * structured-cloneable.
   * @default false
   */
  persist?: boolean
}

/** A registered namespace with its resolved options, from {@link CacheItemMetadata.namespaces}. */
export interface CacheItemMetadataNamespace extends Required<CacheItemMetadataNamespaceOptions> {
  name: string
}

/** One entry yielded by {@link CacheItemMetadata.entries}. */
export interface CacheItemMetadataEntry<T = unknown> {
  collection: string
  key: string | number
  value: T
}

/**
 * Per-item plugin data stored beside cache rows, partitioned by namespace.
 *
 * Reads and writes are synchronous and not queued, so cache hooks can use
 * them from inside a write flush. Keys follow cache row identity: `1` and
 * `'1'` address the same entry.
 */
export interface CacheItemMetadata {
  /**
   * Declare a namespace, usually during plugin setup. Registering again with the
   * same options is a no-op; registering with different options throws.
   */
  register: (namespace: string, options: CacheItemMetadataNamespaceOptions) => void
  /** Read the value of one item, or `undefined`. */
  read: <T = unknown>(namespace: string, collection: string, key: string | number) => T | undefined
  /** Store the value of one item. Throws for an unregistered namespace. */
  write: <T = unknown>(namespace: string, collection: string, key: string | number, value: T) => void
  /** Remove the value of one item. */
  delete: (namespace: string, collection: string, key: string | number) => void
  /** Iterate one namespace, optionally restricted to one collection. */
  entries: <T = unknown>(namespace: string, collection?: string) => IterableIterator<CacheItemMetadataEntry<T>>
  /** Number of entries in one namespace. */
  size: (namespace: string) => number
  /** Registered namespaces, in registration order. */
  namespaces: () => CacheItemMetadataNamespace[]
}

/** Serialized item metadata: namespace → collection → key → value. */
export type SerializedCacheItemMetadata = Record<string, Record<string, Record<string | number, unknown>>>
