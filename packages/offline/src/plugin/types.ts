import type { ResolvedCollection } from '@rstore/shared'
import type { useIndexedDb } from '../indexeddb'

export interface CreateOfflinePluginOptions {
  /** The collections that should be handled by the offline plugin. */
  filterCollection?: (collection: ResolvedCollection) => boolean
  /** The name of the IndexedDB database to use for offline storage. */
  dbName?: string
  /** Allows cleaning up the data from the offline storage by version. */
  version?: number | string
}

/** Global offline storage metadata. */
export interface OfflineMetadata {
  /** Version used to invalidate local storage. */
  version: number | string
}

/** Per-collection sync metadata. */
export interface OfflineCollectionMetadata {
  /** Last successful sync timestamp. */
  updatedAt: number
}

/** One queued single-item mutation. */
export interface QueuedMutation {
  /** IndexedDB operation id. */
  id: string
  /** Mutation type. */
  type: 'create' | 'update' | 'delete'
  /** Collection name. */
  collectionName: string
  /** Item key for update/delete/create replay. */
  key?: string | number
  /** Item payload for create/update replay. */
  item?: any
  /** Queue insertion time. */
  time: Date
}

/** One queued multi-item mutation. */
export interface QueuedManyMutation {
  /** IndexedDB operation id. */
  id: string
  /** Mutation type. */
  type: 'createMany' | 'updateMany' | 'deleteMany'
  /** Collection name. */
  collectionName: string
  /** Item keys for delete replay. */
  keys?: Array<string | number>
  /** Item payloads for create/update replay. */
  items?: Array<any>
  /** Queue insertion time. */
  time: Date
}

/** Runtime shared by offline plugin hook installers. */
export interface OfflinePluginRuntime {
  /** Plugin options. */
  options: CreateOfflinePluginOptions
  /** IndexedDB object store for queued operations. */
  opsStoreName: string
  /** Local-storage key for global metadata. */
  globalMetadataKey: string
  /** Global metadata read during setup. */
  globalMetadata: OfflineMetadata | null
  /** Lazily initialized IndexedDB helper. */
  db?: Awaited<ReturnType<typeof useIndexedDb>>
}

export type OfflineQueuedOperation = QueuedMutation | QueuedManyMutation
