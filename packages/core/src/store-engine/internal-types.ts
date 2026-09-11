import type { CacheLayer, CacheTombstone, CustomHookMeta, FieldTimestamps, ResolvedCollection } from '@rstore/shared'
import type { TombstoneStore } from '../tombstone.js'
import type { ChangeRecorder } from './change-recorder.js'
import type { MutableEngineChangeSet } from './change-set.js'
import type {
  DeleteItemParams,
  EngineAfterWritePayload,
  EngineCallbacks,
  EngineConflictPayload,
  EngineResetPayload,
  EngineWriteChange,
  EngineWriteCommitPayload,
  ObserverCallback,
  Unsubscribe,
  WriteItemParams,
  WriteItemsParams,
} from './types.js'

/** Stable internal identity for numeric/string key aliases. */
export type KeyId = string

/** Collision-free internal index bucket identity. */
export type IndexValueId = string

/** Internal fine-grained observer registry. */
export interface ObserverRegistry {
  /** Observe one canonical item id. */
  observeItem: (collection: string, key: string | number, callback: ObserverCallback) => Unsubscribe
  /** Observe one collection list. */
  observeList: (collection: string, callback: ObserverCallback) => Unsubscribe
  /** Observe one encoded index lookup id. */
  observeIndex: (collection: string, indexKey: string, indexValueId: IndexValueId, callback: ObserverCallback) => Unsubscribe
  /** Return whether any direct subscription is active. */
  hasAny: () => boolean
  /** Return whether one exact item subscription is active. */
  hasItem: (collection: string, key: KeyId) => boolean
  /** Return whether one list subscription is active. */
  hasList: (collection: string) => boolean
  /** Return whether one exact index dependency is active. */
  hasIndex: (dependency: string) => boolean
  /** Return whether a collection owns any index subscription. */
  hasIndexCollection: (collection: string) => boolean
  /** Return directly observed item identities for a collection reset. */
  itemKeys: (collection: string) => Iterable<KeyId>
  /** Return directly observed index dependencies for a collection reset. */
  indexDependencies: (collection: string) => Iterable<string>
  /** Dispatch one completed flush journal. */
  dispatch: (changes: MutableEngineChangeSet) => void
  /** Release observer maps and ignore future invalidations. */
  dispose: () => void
}

/** Composite index buckets plus backward-compatible joined aliases. */
export interface EngineIndexState {
  /** Index field count selecting direct bucket layout. */
  arity: number
  /** Direct single-field value buckets. */
  scalarBuckets: Map<string, EngineIndexBucket>
  /** Direct two-field value buckets. */
  tupleBuckets: Map<string, Map<string, EngineIndexBucket>>
  /** Encoded buckets for indexes containing more than two fields. */
  encodedBuckets: Map<IndexValueId, EngineIndexBucket>
  /** Retained buckets currently containing no live item ids. */
  emptyBucketCount: number
  /** Legacy joined value to every canonical tuple producing it. */
  legacyAliases: Map<string, Set<EngineIndexBucket>>
  /** Cached opaque dependency ids for hot repeated memberships. */
  dependencyIds: Map<IndexValueId, string>
}

/** Uniform materialized index bucket. */
export interface EngineIndexBucket {
  /** Live canonical item ids. */
  keys: Set<KeyId>
  /** Exact collision-safe dependency value identity. */
  valueId: IndexValueId
  /** Backward-compatible joined composite value. */
  legacy?: string
  /** Encoded backward-compatible observer identity. */
  legacyId?: IndexValueId
  /** Whether empty-bucket retention currently counts this bucket. */
  retainedEmpty?: boolean
}

/** Pre-normalized optimistic layer used by hot reads. */
export interface EngineLayer {
  /** Original public layer. */
  layer: CacheLayer
  /** Detached patches by canonical item id. */
  state: Record<KeyId, any>
  /** Deleted canonical ids. */
  deletedItems: Set<KeyId>
  /** Deduplicated patch and delete ids in stable transition order. */
  affectedKeys: KeyId[]
  /** Fallback public forms for layer-only partial rows and deletes. */
  fallbackKeyValues?: Map<KeyId, string | number>
}

/** Plain per-collection engine storage. */
export interface EngineCollectionState {
  /** Resolved schema used to recover public key forms from stored items. */
  collection?: ResolvedCollection<any, any, any>
  /** Whether public keys use direct override/id/__id extraction. */
  usesDefaultKey: boolean
  /** Base items by canonical id. */
  base: Map<KeyId, any>
  /** Sparse caller key forms only when current data cannot recover them. */
  keyOverrides?: Map<KeyId, string | number>
  /** Materialized collection indexes. */
  indexes: Map<string, EngineIndexState>
  /** Ordered optimistic layers. */
  layers: EngineLayer[]
  /** Active layer ownership count by affected canonical id. */
  layeredKeyCounts?: Map<KeyId, number>
  /** Cached layer-resolved values. */
  resolvedItems: Map<KeyId, any>
  /** Cached visible canonical ids. */
  visibleKeys: KeyId[] | undefined
}

/** Mutable holder preserving module state identity. */
export interface ModuleHolder {
  /** Current module state value. */
  value: any
}

/** Exact module identity stored after legacy migration. */
export interface ModuleIdentity {
  /** Module name. */
  name: string
  /** Module-local state key. */
  key: string
}

/** Structurally validated snapshot ready for queued staging. */
export interface NormalizedCacheSnapshot {
  /** Known or unknown collection input records. */
  collections: Map<string, NormalizedCollectionRows>
  /** Validated marker record. */
  markers: Record<string, boolean>
  /** Exact version-1 module tuples. */
  modules: Map<string, Map<string, unknown>>
  /** Pending versionless module identities. */
  legacyModules: Map<string, unknown>
  /** Validated query metadata. */
  queryMeta: Record<string, CustomHookMeta>
  /** Per-row causal stamps, keyed by serialized public key. */
  fieldTimestamps: Map<string, Map<string, FieldTimestamps>>
  /** Validated causal deletes, omitted when legacy state must retain them. */
  tombstones?: CacheTombstone[]
}

/** Detached collection container using aligned key and item arrays. */
export interface NormalizedCollectionRows {
  /** Own enumerable snapshot keys in insertion order. */
  keys: string[]
  /** Item references aligned with {@link keys}. */
  values: any[]
}

/** Post-commit callback effect. */
export type EngineEffect
  = | { type: 'writeCommitted', payload: EngineWriteCommitPayload }
    | { type: 'afterWrite', payload: EngineAfterWritePayload }
    | { type: 'conflict', payload: EngineConflictPayload }
    | { type: 'layerAdd', layer: CacheLayer }
    | { type: 'layerRemove', layer: CacheLayer }
    | { type: 'reset', payload: EngineResetPayload }

/** Result of a committed item mutation. */
export interface WriteCommitResult {
  /** Deferred callbacks in legacy hook order. */
  effects: EngineEffect[]
  /** Root collection write change, when state committed. */
  change?: EngineWriteChange
}

/** FIFO engine operation. */
export type QueuedOperation
  = | { type: 'writeItem', params: WriteItemParams }
    | {
      type: 'writeItems'
      params: WriteItemsParams
      index: number
      changes?: EngineWriteChange[]
      /** One recorder keeps a batch invisible to adapters until it settles. */
      recorder?: ChangeRecorder
      /** Nested callbacks run only after final bridge publication. */
      effects?: EngineEffect[]
      /** A failed nested row committed earlier children and can be retried. */
      partialCommit?: true
    }
    | { type: 'deleteItem', params: DeleteItemParams }
    | { type: 'addLayer', layer: CacheLayer }
    | { type: 'removeLayer', layerId: string }
    | { type: 'setState', state: NormalizedCacheSnapshot }
    | { type: 'clearCollection', collection: ResolvedCollection<any, any, any> }
    | { type: 'clear' }

/** Write staggering controller. */
export interface Staggering {
  /** Whether one more item can commit now. */
  canProcess: () => boolean
  /** Consume one item budget slot. */
  consume: () => void
  /** Register queue retry after budget reset. */
  setFlush: (flush: () => void) => void
  /** Whether staggering is configured. */
  enabled: boolean
  /** Cancel pending budget reset. */
  dispose: () => void
}

/** Internal mutable engine context. */
export interface EngineContext {
  /** Collection storage. */
  collections: Map<string, EngineCollectionState>
  /** Query markers. */
  markers: Record<string, boolean>
  /** Exact module registry. */
  modules: Map<string, Map<string, ModuleHolder>>
  /** Unclaimed legacy module snapshots. */
  pendingLegacyModules: Map<string, unknown>
  /** Legacy entries already claimed by an exact tuple. */
  legacyModuleClaims: Map<string, ModuleIdentity>
  /** Per-field CRDT timestamps. */
  fieldTimestamps: Map<string, Map<KeyId, FieldTimestamps>>
  /** Causal deletion registry. */
  tombstones: TombstoneStore
  /** Live query metadata. */
  queryMeta: Record<string, CustomHookMeta>
  /** Layer id to owning collection. */
  layerIdToCollection: Map<string, string>
  /** Nested pause counter. */
  pauseDepth: number
  /** Pending FIFO operations. */
  queue: QueuedOperation[]
  /** Cursor into pending operations. */
  queueHead: number
  /** Reentrancy guard. */
  isFlushingQueue: boolean
  /** Whether disposal discarded future work. */
  disposed: boolean
  /** Framework callbacks. */
  callbacks: EngineCallbacks
  /** Internal observer registry. */
  observers: ObserverRegistry
  /** Write staggering controller. */
  staggering: Staggering
  /** Indexes whose retained empty buckets may need a bounded sweep. */
  indexSweepCandidates: Set<EngineIndexState>
  /** Dependencies requested before their collection index state exists. */
  pendingIndexDependencies: Map<string, Map<string, Map<IndexValueId, string>>>
  /** Get or create collection storage. */
  ensureCollection: (name: string) => EngineCollectionState
}
