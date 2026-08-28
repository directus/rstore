import type {
  CacheIndexValue,
  CacheLayer,
  CacheStateInput,
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
import type { EngineChangeInterest, EngineChangeSet, ObserverChanges } from './observer-changes.js'
import type { EngineAfterWritePayload, EngineStateChangeSink, EngineWriteCommitPayload } from './write-callbacks.js'

export type { EngineAfterWritePayload, EngineStateChangeSink, EngineWriteChange, EngineWriteCommitPayload } from './write-callbacks.js'

/** Unsubscribe handle returned by engine observer methods. */
export type Unsubscribe = () => void

/** Callback fired when an observed cache scope changes. */
export type ObserverCallback = () => void

/** Payload passed to {@link EngineCallbacks.onConflict}. */
export interface EngineConflictPayload {
  /** Collection containing the conflicted item. */
  collection: ResolvedCollection<any, any, any>
  /** Canonical public item key. */
  key: string | number
  /** Rejected or resolved field conflicts. */
  conflicts: FieldConflict[]
}

/** Reset scope applied before {@link EngineCallbacks.onReset}. */
export interface EngineResetPayload {
  /** Reset source operation. */
  source: 'clear' | 'setState' | 'clearCollection'
  /** Collection reset by `clearCollection`; omitted for whole-cache resets. */
  collection?: ResolvedCollection<any, any, any>
}

/** Callbacks injected by an embedding framework. */
export interface EngineCallbacks {
  /** Resolve a collection by name. */
  getCollection: (name: string) => ResolvedCollection<any, any, any> | undefined
  /** Resolve a related child item among candidate collection names. */
  resolveChildCollection: (item: any, possibleNames: string[]) => ResolvedCollection<any, any, any> | null
  /** Synchronize framework state immediately after each committed operation. */
  onStateChange?: (changes: EngineChangeSet) => void
  /** Return dependencies currently consumed by a selective state bridge. */
  getStateChangeInterest?: () => EngineChangeInterest | undefined
  /** Allocation-light state bridge used by framework adapters. */
  stateChangeSink?: EngineStateChangeSink
  /** Allocation-light write callback not requiring `EngineWriteChange` objects. */
  onWriteCommitted?: (payload: EngineWriteCommitPayload) => void
  /** Fired after a write or delete commits. */
  onAfterWrite?: (payload: EngineAfterWritePayload) => void
  /** Fired when a CRDT merge reports field conflicts. */
  onConflict?: (payload: EngineConflictPayload) => void
  /** Fired after an optimistic layer commits. */
  onLayerAdd?: (layer: CacheLayer) => void
  /** Fired after an optimistic layer removal commits. */
  onLayerRemove?: (layer: CacheLayer) => void
  /** Fired after a cache or collection reset commits. */
  onReset?: (payload: EngineResetPayload) => void
  /** Wrap newly created module state for the embedding framework. */
  wrapModuleState?: (value: any) => any
  /** Bridge hook for batched observer invalidations. */
  onObserverFlush?: (changes: ObserverChanges) => void
}

/** Tombstone auto-GC configuration. `false` disables background sweeps. */
export type TombstoneGcOptions = false | {
  /** Sweep interval in milliseconds. */
  intervalMs?: number
  /** Drop tombstones older than this duration in milliseconds. */
  ttlMs?: number
}

/** Options for {@link createStoreEngine}. */
export interface EngineOptions {
  /** Framework callbacks and collection resolvers. */
  callbacks: EngineCallbacks
  /** Maximum writes per 10ms window; zero disables staggering. */
  cacheStaggering?: number
  /** Tombstone auto-GC settings. */
  tombstoneGc?: TombstoneGcOptions
  /** Server engines skip background GC timers. */
  isServer?: boolean
}

/** Parameters for one item write. */
export interface WriteItemParams {
  /** Target collection. */
  collection: ResolvedCollection<any, any, any>
  /** Public item key. */
  key: string | number
  /** Full or partial item data. */
  item: ResolvedCollectionItemBase<any, any, any>
  /** Optional query marker. */
  marker?: string
  /** Internal batch flag retained for bridge compatibility. */
  fromWriteItems?: boolean
  /** Hook metadata. */
  meta?: CustomHookMeta
  /** Optional CRDT field timestamps. */
  fieldTimestamps?: FieldTimestamps
}

/** Parameters for a batch item write. */
export interface WriteItemsParams {
  /** Target collection. */
  collection: ResolvedCollection<any, any, any>
  /** Keyed items in commit order. */
  items: Array<{ key: string | number, value: ResolvedCollectionItemBase<any, any, any> }>
  /** Optional marker set after the final item. */
  marker?: string
  /** Hook metadata shared by the batch. */
  meta?: CustomHookMeta
}

/** Parameters for one item deletion. */
export interface DeleteItemParams {
  /** Target collection. */
  collection: ResolvedCollection<any, any, any>
  /** Public item key. */
  key: string | number
  /** Optional causal tombstone timestamp. */
  deletedAt?: FieldTimestampValue
}

/** Parameters for writing a related child item. */
export interface WriteItemForRelationParams {
  /** Collection owning the relation. */
  parentCollection: ResolvedCollection<any, any, any>
  /** Parent relation property. */
  relationKey: string | number | symbol
  /** Relation definition. */
  relation: CollectionRelation
  /** Related item to write. */
  childItem: any
  /** Hook metadata. */
  meta?: CustomHookMeta
}

/** Parameters for resolving list candidate keys. */
export interface ResolveKeysParams {
  /** Collection being read. */
  collection: ResolvedCollection<any, any, any>
  /** Optional marker gate. */
  marker?: string
  /** Explicit keys, bypassing list/index resolution. */
  keys?: Array<string | number>
  /** Optional index name. */
  indexKey?: string
  /** Scalar single-field value or composite tuple. */
  indexValue?: CacheIndexValue
}

/** Framework-agnostic plain-JS storage engine. */
export interface StoreEngine<
  _TSchema extends StoreSchema = StoreSchema,
  _TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  /** Read one resolved raw item. */
  readItemRaw: (params: { collection: ResolvedCollection<any, any, any>, key: string | number }) => any | undefined
  /** Resolve visible, explicit, or indexed candidate keys. */
  resolveKeys: (params: ResolveKeysParams) => Array<string | number>
  /**
   * Visit current raw items without allocating a public key array.
   * Returning `false` from dependency or item visitor stops the scan.
   */
  scanItemsRaw: (
    params: ResolveKeysParams,
    visit: (key: string | number, item: unknown) => boolean | void,
    onIndexDependency?: (dependency: string) => boolean | void,
  ) => void
  /** Read one reconciled index bucket. */
  getIndexBucket: (collection: string, indexKey: string, indexValue: CacheIndexValue) => ReadonlySet<string | number> | undefined
  /** Return stable opaque identity for one index dependency. */
  getIndexDependencyId: (collection: string, indexKey: string, indexValue: CacheIndexValue) => string
  /** Check whether a query marker exists. */
  hasMarker: (marker: string) => boolean
  /** Queue one item write. */
  writeItem: (params: WriteItemParams) => void
  /** Queue a batch item write. */
  writeItems: (params: WriteItemsParams) => void
  /** Queue one item deletion. */
  deleteItem: (params: DeleteItemParams) => void
  /** Queue one related item write. */
  writeItemForRelation: (params: WriteItemForRelationParams) => void
  /** Read CRDT field timestamps. */
  readFieldTimestamps: (params: { collectionName: string, key: string | number }) => FieldTimestamps | undefined
  /** Write CRDT field timestamps. */
  writeFieldTimestamps: (params: { collectionName: string, key: string | number, timestamps: FieldTimestamps }) => void
  /** Get or create stable module state. */
  getModuleState: (name: string, key: string, initState: any) => any
  /** Serialize version-1 base state. */
  getState: () => CustomCacheState
  /** Queue validated versioned or legacy state hydration. */
  setState: (state: CacheStateInput) => void
  /** Queue a whole-cache clear. */
  clear: () => void
  /** Queue one collection clear. */
  clearCollection: (params: { collection: ResolvedCollection<any, any, any> }) => void
  /** Immediately evict one unused base item. */
  garbageCollectKey: (collection: ResolvedCollection<any, any, any>, key: string | number) => boolean
  /** Iterate current base keys. */
  forEachKey: (collection: string, callback: (key: string | number) => void) => void
  /** Queue an optimistic layer. */
  addLayer: (layer: CacheLayer) => void
  /** Read one optimistic layer. */
  getLayer: (layerId: string) => CacheLayer | undefined
  /** Queue one layer removal. */
  removeLayer: (layerId: string) => void
  /** Read-only tombstone registry. */
  tombstones: TombstoneStore
  /** Remove tombstones older than a cutoff. */
  gcTombstones: (olderThan: FieldTimestampValue) => Array<{ collection: string, key: string | number }>
  /** Increment queue pause depth. */
  pause: () => void
  /** Decrement pause depth and drain at zero. */
  resume: () => void
  /** Stop timers and discard pending work. */
  dispose: () => void
  /** Observe one item identity. */
  observeItem: (collection: string, key: string | number, callback: ObserverCallback) => Unsubscribe
  /** Observe one collection visible-key set. */
  observeList: (collection: string, callback: ObserverCallback) => Unsubscribe
  /** Observe one index lookup. */
  observeIndex: (collection: string, indexKey: string, indexValue: CacheIndexValue, callback: ObserverCallback) => Unsubscribe
  /** Access live query metadata for SSR and bridge state. */
  getQueryMeta: () => Record<string, CustomHookMeta>
}
