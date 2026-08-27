import type { CustomCacheState, ResolvedCollection } from '@rstore/shared'
import type { MutableEngineChangeSet } from './change-set.js'
import type { EngineCollectionState, EngineContext, EngineEffect, NormalizedCacheSnapshot } from './internal-types.js'
import { invalidateObservedCollection, touchItem } from './change-set.js'
import { createCollectionState } from './context.js'
import { getPublicKey, isEntityKey, registerBaseKey, restoreLayerKeyValues } from './identity.js'
import { rebuildIndexes } from './indexes.js'
import { applyModuleHydration, prepareModuleClear, prepareModuleHydration, serializeModules } from './modules.js'
import { copyNullRecord, createNullRecord } from './records.js'
import { getVisibleKeyIds } from './view.js'
import { deleteItemFromBase } from './write.js'

/** Serialize base data only; optimistic layers stay process-local. */
export function getState(ctx: EngineContext): CustomCacheState {
  const collections = createNullRecord<Record<string | number, any>>()
  for (const [name, state] of ctx.collections) {
    const target = createNullRecord<any>()
    collections[name] = target
    for (const [id, item] of state.base) {
      if (item !== undefined) {
        target[getPublicKey(state, id)] = item
      }
    }
  }
  return {
    $rstoreVersion: 1,
    collections,
    markers: copyNullRecord(ctx.markers),
    modules: serializeModules(ctx),
    queryMeta: copyNullRecord(ctx.queryMeta),
  }
}

/** Hydrate a staged snapshot while preserving active layers and identities. */
export function setStateNow(ctx: EngineContext, changes: MutableEngineChangeSet, snapshot: NormalizedCacheSnapshot): EngineEffect[] {
  // Every throwable collection key derivation, index rebuild, module kind
  // check, and new module wrapper runs before the live state swap.
  const collections = stageCollections(ctx, snapshot.collections)
  const modules = prepareModuleHydration(ctx, snapshot)

  ctx.markers = snapshot.markers
  ctx.fieldTimestamps.clear()
  commitCollections(ctx, changes, collections)
  applyModuleHydration(ctx, modules)
  replaceQueryMeta(ctx, snapshot.queryMeta)
  return [{ type: 'reset', payload: { source: 'setState' } }]
}

/** Clear base state while retaining installed optimistic layers. */
export function clearNow(ctx: EngineContext, changes: MutableEngineChangeSet): EngineEffect[] {
  const collections = stageCollections(ctx, new Map())
  const modules = prepareModuleClear(ctx)
  ctx.markers = createNullRecord<boolean>()
  ctx.fieldTimestamps.clear()
  commitCollections(ctx, changes, collections)
  applyModuleHydration(ctx, modules)
  clearTombstones(ctx)
  replaceQueryMeta(ctx, createNullRecord())
  return [{ type: 'reset', payload: { source: 'clear' } }]
}

/** Clear one collection at queue head and retain active layer projections. */
export function clearCollectionNow(
  ctx: EngineContext,
  changes: MutableEngineChangeSet,
  collection: ResolvedCollection<any, any, any>,
): EngineEffect[] {
  const effects: EngineEffect[] = [{ type: 'reset', payload: { source: 'clearCollection', collection } }]
  const state = ctx.collections.get(collection.name)
  if (state) {
    // Snapshot only after this operation reaches FIFO head. Mutations finish
    // before any delete/reset hook observes the committed collection state.
    for (const id of Array.from(state.base.keys())) {
      const result = deleteItemFromBase(ctx, changes, { collection, key: getPublicKey(state, id) })
      effects.push(...result.effects)
    }
  }
  ctx.fieldTimestamps.delete(collection.name)
  clearCollectionTombstones(ctx, collection.name)
  invalidateObservedCollection(ctx.observers, changes, collection.name)
  return effects
}

/** Stage known collection states without touching live maps. */
function stageCollections(
  ctx: EngineContext,
  incoming: Map<string, Record<string, any>>,
): Map<string, EngineCollectionState> {
  const result = new Map<string, EngineCollectionState>()
  const names = new Set([...ctx.collections.keys(), ...incoming.keys()])
  for (const name of names) {
    const collection = ctx.callbacks.getCollection(name)
    const previous = ctx.collections.get(name)
    if (!collection && !previous) {
      // Unknown SSR collections stay tolerated and are intentionally ignored.
      continue
    }
    const state = createCollectionState()
    state.layers = previous?.layers ?? []
    if (collection) {
      restoreCollection(state, collection, incoming.get(name))
      rebuildIndexes(collection, state)
    }
    else {
      restoreLayerKeyValues(state)
    }
    result.set(name, state)
  }
  return result
}

/** Restore snapshot rows using collection-derived canonical key forms. */
function restoreCollection(
  state: EngineCollectionState,
  collection: ResolvedCollection<any, any, any>,
  incoming: Record<string, any> | undefined,
): void {
  for (const rawKey of Object.keys(incoming ?? {})) {
    const item = incoming![rawKey]
    if (item == null) {
      continue
    }
    const derived = collection.getKey(item)
    const key = isEntityKey(derived) ? derived : rawKey
    const id = registerBaseKey(state, collection, key, item)
    state.base.set(id, item)
  }
  restoreLayerKeyValues(state)
}

/** Swap staged collections and invalidate every old/new observed scope. */
function commitCollections(ctx: EngineContext, changes: MutableEngineChangeSet, staged: Map<string, EngineCollectionState>): void {
  const names = new Set([...ctx.collections.keys(), ...staged.keys()])
  for (const name of names) {
    const previous = ctx.collections.get(name)
    const next = staged.get(name)
    if (previous) {
      for (const id of getVisibleKeyIds(previous)) touchItem(changes, name, id)
    }
    if (next) {
      for (const id of getVisibleKeyIds(next)) touchItem(changes, name, id)
    }
  }
  ctx.collections.clear()
  for (const [name, state] of staged) {
    ctx.collections.set(name, state)
  }
  for (const name of names) {
    invalidateObservedCollection(ctx.observers, changes, name)
  }
}

/** Replace query metadata in place so Vue bridge references remain live. */
function replaceQueryMeta(ctx: EngineContext, source: Record<string, any>): void {
  if (source === ctx.queryMeta) {
    return
  }
  for (const key of Object.keys(ctx.queryMeta)) {
    delete ctx.queryMeta[key]
  }
  Object.assign(ctx.queryMeta, source)
}

/** Clear every tombstone without depending on encoded entry identities. */
function clearTombstones(ctx: EngineContext): void {
  for (const [, tombstone] of Array.from(ctx.tombstones.entries())) {
    ctx.tombstones.clear(tombstone.collection, tombstone.key)
  }
}

/** Clear tombstones owned by one collection. */
function clearCollectionTombstones(ctx: EngineContext, collectionName: string): void {
  for (const [, tombstone] of Array.from(ctx.tombstones.entries())) {
    if (tombstone.collection === collectionName) {
      ctx.tombstones.clear(tombstone.collection, tombstone.key)
    }
  }
}
