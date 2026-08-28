import type { CacheLayer, CustomHookMeta, FieldTimestamps, ResolvedCollection } from '@rstore/shared'
import type { TombstoneStore } from '../tombstone.js'
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
  /** Canonical encoded tuple to item ids. */
  buckets: Map<IndexValueId, Set<KeyId>>
  /** Retained buckets currently containing no live item ids. */
  emptyBucketCount: number
  /** Legacy joined value to every canonical tuple producing it. */
  legacyAliases: Map<string, Set<IndexValueId>>
  /** Cached opaque dependency ids for hot repeated memberships. */
  dependencyIds: Map<IndexValueId, string>
  /** Reusable scalar memberships by coerced field value. */
  scalarValues: Map<string, IndexedValue>
  /** Reusable two-field memberships without serialization on hot writes. */
  tupleValues: Map<string, Map<string, IndexedValue>>
}

/** Cached current membership for one item and index. */
export interface IndexedValue {
  /** Exact collision-safe bucket identity. */
  id: IndexValueId
  /** Backward-compatible joined composite value. */
  legacy: string
  /** Encoded backward-compatible observer identity. */
  legacyId: IndexValueId
}

/** Pre-normalized optimistic layer used by hot reads. */
export interface EngineLayer {
  /** Original public layer. */
  layer: CacheLayer
  /** Patches by canonical item id. */
  state: Map<KeyId, any>
  /** Deleted canonical ids. */
  deletedItems: Set<KeyId>
  /** Union of patch and delete ids. */
  affectedKeys: Set<KeyId>
  /** Stable affected-key order used by transition kernels. */
  affectedKeyList: KeyId[]
  /** Public key forms introduced by this layer. */
  keyValues: Map<KeyId, string | number>
  /** Keys whose layer items provide a canonical collection key. */
  canonicalKeys: Set<KeyId>
}

/** Plain per-collection engine storage. */
export interface EngineCollectionState {
  /** Base items by canonical id. */
  base: Map<KeyId, any>
  /** Public key forms owned by base rows. */
  baseKeyValues: Map<KeyId, string | number>
  /** Preferred public numeric/string key form. */
  keyValues: Map<KeyId, string | number>
  /** Materialized collection indexes. */
  indexes: Map<string, EngineIndexState>
  /** Current resolved memberships by item and index. */
  indexMemberships: Map<KeyId, Map<string, IndexedValue>>
  /** Ordered optimistic layers. */
  layers: EngineLayer[]
  /** Cached layer-resolved values. */
  resolvedItems: Map<KeyId, any>
  /** Cached visible canonical ids. */
  visibleKeys: KeyId[] | undefined
  /** Cached visible public keys. */
  visibleKeyValues: Array<string | number> | undefined
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
    | { type: 'writeItems', params: WriteItemsParams, index: number, changes?: EngineWriteChange[] }
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
