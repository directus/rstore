import type {
  CacheLayer,
  Collection,
  CollectionDefaults,
  CollectionRelation,
  CustomCacheState,
  CustomHookMeta,
  FieldConflict,
  FieldTimestamps,
  FieldTimestampValue,
  ResolvedCollection,
  ResolvedCollectionItemBase,
  StoreSchema,
} from '@rstore/shared'
import type { TombstoneStore } from '../tombstone.js'

/** Unsubscribe handle returned by the engine's `observe*` methods. */
export type Unsubscribe = () => void

/** A plain callback fired when an observed scope changes. */
export type ObserverCallback = () => void

/** Fine-grained observer registry exposed by the engine. */
export interface ObserverRegistry {
  /** Observe changes to a single item by key. */
  observeItem: (collection: string, key: string | number, cb: ObserverCallback) => Unsubscribe
  /** Observe changes to the visible key set of a collection. */
  observeList: (collection: string, cb: ObserverCallback) => Unsubscribe
  /** Observe changes to a single index bucket. */
  observeIndex: (collection: string, indexKey: string, indexValue: string, cb: ObserverCallback) => Unsubscribe
  /** Record an item value change for the next flush. */
  touchItem: (collection: string, key: string | number) => void
  /** Record a visible-key-set (or marker) change for the next flush. */
  touchList: (collection: string) => void
  /** Record an index bucket change for the next flush. */
  touchIndex: (collection: string, indexKey: string, indexValue: string) => void
  /** Notify all observers matching the accumulated change set, then reset. */
  flush: () => void
}

/** Payload passed to {@link EngineCallbacks.onAfterWrite}. */
export interface EngineAfterWritePayload {
  collection: ResolvedCollection<any, any, any>
  key?: string | number
  result?: any
  marker?: string
  operation: 'write' | 'delete'
}

/** Payload passed to {@link EngineCallbacks.onConflict}. */
export interface EngineConflictPayload {
  collection: ResolvedCollection<any, any, any>
  key: string | number
  conflicts: FieldConflict[]
}

/** Callbacks injected by the embedding framework. */
export interface EngineCallbacks {
  /** Resolve a collection by name. */
  getCollection: (name: string) => ResolvedCollection<any, any, any> | undefined
  /** Resolve the collection of a related child item among candidate names. */
  resolveChildCollection: (item: any, possibleNames: string[]) => ResolvedCollection<any, any, any> | null
  /** Fired after a write or delete is applied (drives `afterCacheWrite`). */
  onAfterWrite?: (payload: EngineAfterWritePayload) => void
  /** Fired when a CRDT field merge yields conflicts. */
  onConflict?: (payload: EngineConflictPayload) => void
  /** Fired after a layer is added. */
  onLayerAdd?: (layer: CacheLayer) => void
  /** Fired after a layer is removed. */
  onLayerRemove?: (layer: CacheLayer) => void
  /** Fired after the cache is reset (clear / setState). */
  onReset?: () => void
}

/** Tombstone auto-GC configuration. `false` disables the background sweep. */
export type TombstoneGcOptions = false | {
  /** Sweep interval in ms. Defaults to 60_000. */
  intervalMs?: number
  /** Drop tombstones older than this many ms. Defaults to 86_400_000 (24h). */
  ttlMs?: number
}

/** Options for {@link createStoreEngine}. */
export interface EngineOptions {
  callbacks: EngineCallbacks
  /**
   * Maximum number of writes applied synchronously per 10ms window. `0`
   * disables staggering (writes apply immediately).
   */
  cacheStaggering?: number
  /** Tombstone auto-GC settings. */
  tombstoneGc?: TombstoneGcOptions
  /** Whether the engine belongs to a server-side store (disables auto-GC). */
  isServer?: boolean
}

/**
 * Per-collection plain-JS storage. No reactivity — the bridge maps the
 * engine's observers onto its own signals.
 */
export interface EngineCollectionState {
  /** Canonical raw items keyed by primary key. */
  base: Map<string | number, any>
  /** indexKey (`field1:field2`) -> joined value -> set of item keys. */
  indexes: Map<string, Map<string, Set<string | number>>>
  /** Ordered optimistic layers affecting this collection. */
  layers: CacheLayer[]
}

/**
 * A queued cache operation. Operations are applied in FIFO order when the
 * cache is resumed or when the staggering budget allows.
 */
export type QueuedOperation
  = | { type: 'writeItem', params: WriteItemParams }
    | { type: 'writeItems', params: WriteItemsParams, index: number }
    | { type: 'deleteItem', params: DeleteItemParams }
    | { type: 'addLayer', layer: CacheLayer }
    | { type: 'removeLayer', layerId: string }
    | { type: 'setState', state: CustomCacheState }
    | { type: 'clear' }

export interface WriteItemParams {
  collection: ResolvedCollection<any, any, any>
  key: string | number
  item: ResolvedCollectionItemBase<any, any, any>
  marker?: string
  fromWriteItems?: boolean
  meta?: CustomHookMeta
  fieldTimestamps?: FieldTimestamps
}

export interface WriteItemsParams {
  collection: ResolvedCollection<any, any, any>
  items: Array<{ key: string | number, value: ResolvedCollectionItemBase<any, any, any> }>
  marker?: string
  meta?: CustomHookMeta
}

export interface DeleteItemParams {
  collection: ResolvedCollection<any, any, any>
  key: string | number
  deletedAt?: FieldTimestampValue
}

export interface WriteItemForRelationParams {
  parentCollection: ResolvedCollection<any, any, any>
  relationKey: string | number | symbol
  relation: CollectionRelation
  childItem: any
  meta?: CustomHookMeta
}

/** Parameters for reading a list of candidate keys from the engine. */
export interface ResolveKeysParams {
  collection: ResolvedCollection<any, any, any>
  marker?: string
  keys?: Array<string | number>
  indexKey?: string
  indexValue?: string
}

/** Internal mutable engine context shared across the engine's focused modules. */
export interface EngineContext {
  collections: Map<string, EngineCollectionState>
  markers: Record<string, boolean>
  modules: Map<string, { value: any }>
  fieldTimestamps: Map<string, Map<string | number, FieldTimestamps>>
  tombstones: TombstoneStore
  queryMeta: Record<string, CustomHookMeta>
  layerIdToCollection: Map<string, string>
  paused: boolean
  queue: QueuedOperation[]
  isFlushingQueue: boolean
  callbacks: EngineCallbacks
  observers: ObserverRegistry
  /** Staggering controller. */
  staggering: Staggering
  /** Lazily get or create a collection's storage. */
  ensureCollection: (name: string) => EngineCollectionState
}

/** Staggering controller for throttling writes per 10ms window. */
export interface Staggering {
  canProcess: () => boolean
  consume: () => void
  /** Re-run the flush callback after the budget resets. */
  setFlush: (flush: () => void) => void
  /** Whether staggering is active (budget > 0 configured). */
  enabled: boolean
  /** Cancel any pending budget-reset timer (called on engine dispose). */
  dispose: () => void
}

/**
 * Public, framework-agnostic storage engine. Reads return raw plain objects
 * (with `$layer` attached for layered items), never framework proxies.
 */
export interface StoreEngine<
  // Phantom type params: kept so the Vue bridge can carry schema typing on the
  // engine handle, even though the engine's runtime surface is schema-agnostic.
  _TSchema extends StoreSchema = StoreSchema,
  _TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  /** Read the resolved (layer-merged) raw item for a key, or undefined. */
  readItemRaw: (params: { collection: ResolvedCollection<any, any, any>, key: string | number }) => any | undefined
  /** Resolve the candidate key list for a list read (honors layers/index). */
  resolveKeys: (params: ResolveKeysParams) => Array<string | number>
  /** Read an index bucket's key set (after layer reconciliation). */
  getIndexBucket: (collection: string, indexKey: string, indexValue: string) => ReadonlySet<string | number> | undefined
  /** Whether a marker has been set. */
  hasMarker: (marker: string) => boolean
  writeItem: (params: WriteItemParams) => void
  writeItems: (params: WriteItemsParams) => void
  deleteItem: (params: DeleteItemParams) => void
  writeItemForRelation: (params: WriteItemForRelationParams) => void
  readFieldTimestamps: (params: { collectionName: string, key: string | number }) => FieldTimestamps | undefined
  writeFieldTimestamps: (params: { collectionName: string, key: string | number, timestamps: FieldTimestamps }) => void
  getModuleState: (name: string, key: string, initState: any) => any
  getState: () => CustomCacheState
  setState: (state: CustomCacheState) => void
  clear: () => void
  clearCollection: (params: { collection: ResolvedCollection<any, any, any> }) => void
  /** Immediately delete a key without queuing (used by GC). Returns true if removed. */
  garbageCollectKey: (collection: ResolvedCollection<any, any, any>, key: string | number) => boolean
  /** Iterate the base keys of a collection (used by GC). */
  forEachKey: (collection: string, cb: (key: string | number) => void) => void
  addLayer: (layer: CacheLayer) => void
  getLayer: (layerId: string) => CacheLayer | undefined
  removeLayer: (layerId: string) => void
  tombstones: TombstoneStore
  gcTombstones: (olderThan: FieldTimestampValue) => Array<{ collection: string, key: string | number }>
  pause: () => void
  resume: () => void
  dispose: () => void
  observeItem: ObserverRegistry['observeItem']
  observeList: ObserverRegistry['observeList']
  observeIndex: ObserverRegistry['observeIndex']
  /**
   * Direct access to the layer index for devtools/debug.
   * @internal
   */
  _getLayers: () => Map<string, CacheLayer[]>
  /**
   * Live access to the query meta record (persisted via SSR).
   * @internal
   */
  _getQueryMeta: () => Record<string, CustomHookMeta>
  _ctx: EngineContext
}

// Re-export for convenience so consumers import engine types from one place.
export type {
  CacheLayer,
  Collection,
  CollectionDefaults,
  FieldConflict,
  FieldTimestamps,
  FieldTimestampValue,
  ResolvedCollection,
  StoreSchema,
}
