import type { ResolvedCollection } from '@rstore/shared'
import type { TombstoneStore } from '../tombstone.js'
import type { EngineCollectionState, EngineContext, ObserverRegistry, Staggering } from './internal-types.js'
import type { EngineCallbacks } from './types.js'
import { getCollectionMetadata } from './collection-metadata.js'
import { createNullRecord } from './records.js'

/** Create empty storage for one collection. */
export function createCollectionState(collection?: ResolvedCollection<any, any, any>): EngineCollectionState {
  return {
    collection,
    usesDefaultKey: collection ? getCollectionMetadata(collection).usesDefaultKey : false,
    base: new Map(),
    publicKeys: new Map(),
    indexes: new Map(),
    layers: [],
    resolvedItems: new Map(),
    visibleKeys: undefined,
  }
}

/** Construct a fully initialized internal engine context. */
export function createEngineContext(options: {
  callbacks: EngineCallbacks
  observers: ObserverRegistry
  staggering: Staggering
  tombstones: TombstoneStore
}): EngineContext {
  const collections = new Map<string, EngineCollectionState>()

  /** Lazily allocate plain collection storage. */
  const ensureCollection = (name: string): EngineCollectionState => {
    let state = collections.get(name)
    if (!state) {
      state = createCollectionState(options.callbacks.getCollection(name))
      collections.set(name, state)
    }
    return state
  }

  return {
    collections,
    markers: createNullRecord<boolean>(),
    modules: new Map(),
    pendingLegacyModules: new Map(),
    legacyModuleClaims: new Map(),
    fieldTimestamps: new Map(),
    tombstones: options.tombstones,
    queryMeta: createNullRecord(),
    layerIdToCollection: new Map(),
    pauseDepth: 0,
    queue: [],
    queueHead: 0,
    isFlushingQueue: false,
    disposed: false,
    callbacks: options.callbacks,
    observers: options.observers,
    staggering: options.staggering,
    indexSweepCandidates: new Set(),
    pendingIndexDependencies: new Map(),
    ensureCollection,
  }
}
