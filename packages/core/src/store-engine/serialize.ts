import type { CustomCacheState, FieldTimestamps, ResolvedCollection } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineCollectionState, EngineContext, EngineEffect, NormalizedCacheSnapshot, NormalizedCollectionRows } from './internal-types.js'
import { needsCollectionResetKeys, recordCollectionReset } from './change-recorder.js'
import { getCollectionMetadata } from './collection-metadata.js'
import { createCollectionState } from './context.js'
import { getPublicKey, isEntityKey, registerBaseKeyValue } from './identity.js'
import { rebuildIndexes } from './indexes.js'
import { restoreLayerOwnership } from './layers.js'
import { applyModuleHydration, prepareModuleClear, prepareModuleHydration, serializeModules } from './modules.js'
import { copyNullRecord, createNullRecord } from './records.js'
import { getVisibleKeyIds } from './view.js'
import { deleteItemFromBase } from './write.js'

/** Detached collection state plus snapshot-key identities derived during staging. */
interface StagedCollections {
  /** Fully restored collection states ready for commit. */
  states: Map<string, EngineCollectionState>
  /** Serialized row keys mapped to canonical internal ids. */
  keyIds: Map<string, Map<string, string>>
}

/** Serialize base data only; optimistic layers stay process-local. */
export function getState(ctx: EngineContext): CustomCacheState {
  const collections = createNullRecord<Record<string | number, any>>()
  for (const [name, state] of ctx.collections) {
    const target = createNullRecord<any>()
    collections[name] = target
    const directDefaultKeys = state.layers.length === 0 && state.usesDefaultKey && !state.keyOverrides
    for (const [id, item] of state.base) {
      if (item !== undefined) {
        if (directDefaultKeys) {
          const derived = item.$overrideKey ?? item.id ?? item.__id
          target[isEntityKey(derived) && String(derived) === id ? derived : id] = item
        }
        else {
          target[getPublicKey(state, id)] = item
        }
      }
    }
  }
  const fieldTimestamps = serializeFieldTimestamps(ctx)
  const tombstones = Array.from(ctx.tombstones.entries(), ([, tombstone]) => ({ ...tombstone }))
  return {
    $rstoreVersion: 1,
    collections,
    markers: copyNullRecord(ctx.markers),
    modules: serializeModules(ctx),
    queryMeta: copyNullRecord(ctx.queryMeta),
    ...(Object.keys(fieldTimestamps).length ? { fieldTimestamps } : {}),
    ...(tombstones.length ? { tombstones } : {}),
  }
}

/** Serialize causal stamps with their public key form for transport. */
function serializeFieldTimestamps(ctx: EngineContext): Record<string, Record<string | number, FieldTimestamps>> {
  const result = createNullRecord<Record<string | number, FieldTimestamps>>()
  for (const [collectionName, rows] of ctx.fieldTimestamps) {
    const state = ctx.collections.get(collectionName)
    const target = result[collectionName] = createNullRecord<FieldTimestamps>()
    for (const [id, timestamps] of rows) {
      target[state ? getPublicKey(state, id) : id] = { ...timestamps }
    }
  }
  return result
}

/** Hydrate a staged snapshot while preserving active layers and identities. */
export function setStateNow(ctx: EngineContext, changes: ChangeRecorder | undefined, snapshot: NormalizedCacheSnapshot): EngineEffect[] {
  // Every throwable collection key derivation, index rebuild, module kind
  // check, and new module wrapper runs before the live state swap.
  const collections = stageCollections(ctx, snapshot.collections)
  const fieldTimestamps = stageFieldTimestamps(snapshot, collections.keyIds)
  const modules = prepareModuleHydration(ctx, snapshot)

  ctx.markers = snapshot.markers
  commitCollections(ctx, changes, collections.states)
  replaceFieldTimestamps(ctx, fieldTimestamps)
  restoreTombstones(ctx, snapshot)
  applyModuleHydration(ctx, modules)
  replaceQueryMeta(ctx, snapshot.queryMeta)
  return [{ type: 'reset', payload: { source: 'setState' } }]
}

/** Stage causal stamps from collection identities derived before commit. */
function stageFieldTimestamps(
  snapshot: NormalizedCacheSnapshot,
  keyIds: Map<string, Map<string, string>>,
): Map<string, Map<string, FieldTimestamps>> {
  const staged = new Map<string, Map<string, FieldTimestamps>>()
  for (const [collectionName, rows] of snapshot.fieldTimestamps) {
    const timestamps = new Map<string, FieldTimestamps>()
    for (const [key, value] of rows) {
      timestamps.set(keyIds.get(collectionName)?.get(key) ?? key, { ...value })
    }
    if (timestamps.size)
      staged.set(collectionName, timestamps)
  }
  return staged
}

/** Replace staged causal stamps without invoking collection callbacks. */
function replaceFieldTimestamps(ctx: EngineContext, staged: Map<string, Map<string, FieldTimestamps>>): void {
  ctx.fieldTimestamps.clear()
  for (const [collectionName, timestamps] of staged)
    ctx.fieldTimestamps.set(collectionName, timestamps)
}

/** Restore optional causal tombstones after every throwable stage completed. */
function restoreTombstones(ctx: EngineContext, snapshot: NormalizedCacheSnapshot): void {
  if (snapshot.tombstones) {
    clearTombstones(ctx)
    for (const tombstone of snapshot.tombstones) {
      ctx.tombstones.set(tombstone)
    }
  }
}

/** Clear base state while retaining installed optimistic layers. */
export function clearNow(ctx: EngineContext, changes: ChangeRecorder | undefined): EngineEffect[] {
  const collections = stageCollections(ctx, new Map())
  const modules = prepareModuleClear(ctx)
  ctx.markers = createNullRecord<boolean>()
  ctx.fieldTimestamps.clear()
  commitCollections(ctx, changes, collections.states)
  applyModuleHydration(ctx, modules)
  clearTombstones(ctx)
  replaceQueryMeta(ctx, createNullRecord())
  return [{ type: 'reset', payload: { source: 'clear' } }]
}

/** Clear one collection at queue head and retain active layer projections. */
export function clearCollectionNow(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
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
  const current = ctx.collections.get(collection.name)
  if (changes) {
    const ids = current && needsCollectionResetKeys(changes, collection.name) ? getVisibleKeyIds(current) : []
    recordCollectionReset(changes, collection.name, ids, ids)
  }
  return effects
}

/** Stage known collection states without touching live maps. */
function stageCollections(
  ctx: EngineContext,
  incoming: Map<string, NormalizedCollectionRows>,
): StagedCollections {
  const states = new Map<string, EngineCollectionState>()
  const keyIds = new Map<string, Map<string, string>>()
  const names = new Set([...ctx.collections.keys(), ...incoming.keys()])
  for (const name of names) {
    const collection = ctx.callbacks.getCollection(name)
    const previous = ctx.collections.get(name)
    if (!collection && !previous) {
      // Unknown SSR collections stay tolerated and are intentionally ignored.
      continue
    }
    const state = createCollectionState(collection)
    state.layers = previous?.layers ?? []
    if (collection) {
      keyIds.set(name, restoreCollection(state, collection, incoming.get(name)))
      if (getCollectionMetadata(collection).hasIndexes)
        rebuildIndexes(collection, state)
    }
    else {
      restoreLayerOwnership(state)
    }
    states.set(name, state)
  }
  return { states, keyIds }
}

/** Restore snapshot rows using collection-derived canonical key forms. */
function restoreCollection(
  state: EngineCollectionState,
  collection: ResolvedCollection<any, any, any>,
  incoming: NormalizedCollectionRows | undefined,
): Map<string, string> {
  const keyIds = new Map<string, string>()
  for (let index = 0; index < (incoming?.keys.length ?? 0); index++) {
    const rawKey = incoming!.keys[index]!
    const item = incoming!.values[index]
    if (item == null) {
      continue
    }
    const derived = collection.getKey(item)
    const key = isEntityKey(derived) ? derived : rawKey
    const id = registerBaseKeyValue(state, key, derived)
    state.base.set(id, item)
    keyIds.set(rawKey, id)
  }
  restoreLayerOwnership(state)
  return keyIds
}

/** Swap staged collections and invalidate every old/new observed scope. */
function commitCollections(ctx: EngineContext, changes: ChangeRecorder | undefined, staged: Map<string, EngineCollectionState>): void {
  const names = new Set([...ctx.collections.keys(), ...staged.keys()])
  for (const name of names) {
    const previous = ctx.collections.get(name)
    const next = staged.get(name)
    if (changes) {
      const needsKeys = needsCollectionResetKeys(changes, name)
      recordCollectionReset(
        changes,
        name,
        previous && needsKeys ? getVisibleKeyIds(previous) : [],
        next && needsKeys ? getVisibleKeyIds(next) : [],
      )
    }
  }
  ctx.collections.clear()
  for (const [name, state] of staged) {
    ctx.collections.set(name, state)
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
