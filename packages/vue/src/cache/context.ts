import type { EngineAfterWritePayload, EngineCallbacks, EngineConflictPayload, EngineResetPayload } from '@rstore/core'
import type { CacheLayer, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema } from '@rstore/shared'
import type { CacheRuntime, CreateCacheOptions } from './types'
import { createStoreEngine, isKeyDefined } from '@rstore/core'
import { reactive, shallowRef } from 'vue'
import { createItemCellRegistry } from './itemCells'
import { clearAllQueryState, clearQueryStateForCollection } from './queryState'
import { createSignalRegistry } from './signals'
import { appendSyncError, throwSyncErrors } from './syncErrors'
import { createCacheVersionRegistry } from './versions'
import { createWrappedItemRegistry } from './wrappedRegistry'

/** Create mutable runtime shared by all Vue cache modules. */
export function createCacheRuntime<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>({
  getStore,
  cacheStaggering,
  tombstoneGc = {},
  isServer = (import.meta as unknown as { server?: boolean }).server === true,
}: CreateCacheOptions<TSchema, TCollectionDefaults>): CacheRuntime<TSchema, TCollectionDefaults> {
  let runtime: CacheRuntime<TSchema, TCollectionDefaults>
  const pageRefs = new Map<string, any>()

  const callbacks: EngineCallbacks = {
    getCollection: name => getStore().$collections.find(collection => collection.name === name),
    resolveChildCollection: (item, possibleNames) => getStore().$getCollection(item, possibleNames),
    wrapModuleState: value => value && typeof value === 'object' ? reactive(value) : value,
    onStateChange: changes => synchronizeBridge(runtime, changes),
    onAfterWrite: payload => handleAfterWrite(runtime, payload),
    onConflict: payload => handleConflict(getStore, payload),
    onLayerAdd: layer => handleLayerAdd(runtime, layer),
    onLayerRemove: layer => handleLayerRemove(runtime, layer),
    onReset: payload => handleReset(runtime, payload),
  }

  const engine = createStoreEngine({ callbacks, cacheStaggering, tombstoneGc, isServer })
  const versions = createCacheVersionRegistry()
  runtime = {
    getStore,
    engine,
    state: {
      pageRefs,
      get queryMeta() {
        return engine.getQueryMeta()
      },
    },
    signals: createSignalRegistry({ isServer }),
    itemCells: createItemCellRegistry({
      read: (collectionName, key) => {
        const collection = getStore().$collections.find(candidate => candidate.name === collectionName)
        return collection ? engine.readItemRaw({ collection, key }) : undefined
      },
      trackFallback: collectionName => versions.trackItem(collectionName),
    }),
    versions,
    layers: Object.create(null) as CacheRuntime<TSchema, TCollectionDefaults>['layers'],
    wrappedItems: createWrappedItemRegistry(),
    visibleListCache: new Map(),
  }
  return runtime
}

/** Synchronize every bridge registry even when one reactive effect fails. */
function synchronizeBridge(ctx: CacheRuntime, changes: Parameters<NonNullable<EngineCallbacks['onStateChange']>>[0]): void {
  let errors: unknown[] | undefined
  // Existing cells do not track fallback versions. Flushing broad fallbacks
  // first prevents a cell detached by this operation from rerunning twice.
  for (const flush of [ctx.versions.flush, ctx.itemCells.flush, ctx.signals.flush]) {
    try {
      flush(changes)
    }
    catch (error) {
      errors = appendSyncError(errors, error)
    }
  }
  throwSyncErrors(errors, 'Vue cache synchronization failed')
}

/** Apply bridge write invalidation before calling user hooks. */
function handleAfterWrite(ctx: CacheRuntime, payload: EngineAfterWritePayload): void {
  if (payload.changes.some(change => change.visibilityChanged || change.keyFormChanged)) {
    ctx.visibleListCache.delete(payload.collection.name)
  }
  for (const change of payload.changes) {
    if (payload.operation === 'delete' || change.keyFormChanged) {
      ctx.wrappedItems.deleteBase(payload.collection.name, change.previousKey ?? change.key)
    }
  }
  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheWrite', {
    store,
    meta: {},
    collection: payload.collection,
    key: payload.key,
    result: payload.result,
    marker: payload.marker,
    operation: payload.operation,
  })
}

/** Forward a CRDT conflict after engine state commits. */
function handleConflict(
  getStore: CacheRuntime['getStore'],
  payload: EngineConflictPayload,
): void {
  const store = getStore()
  store.$hooks.callHookSync('cacheConflict', {
    store,
    meta: {},
    collection: payload.collection,
    key: payload.key,
    conflicts: payload.conflicts,
  })
}

/** Update layer mirrors before calling layer-add hooks. */
function handleLayerAdd(ctx: CacheRuntime, layer: CacheLayer): void {
  ctx.visibleListCache.delete(layer.collectionName)
  const layers = ensureLayersForCollection(ctx, layer.collectionName)
  layers.value = [...layers.value.filter(candidate => candidate.id !== layer.id), layer]
  const store = ctx.getStore()
  store.$hooks.callHookSync('cacheLayerAdd', { store, layer })
}

/** Remove exact layer wrappers and mirror state before user hooks. */
function handleLayerRemove(ctx: CacheRuntime, layer: CacheLayer): void {
  ctx.visibleListCache.delete(layer.collectionName)
  const layers = ctx.layers[layer.collectionName]
  if (layers) {
    layers.value = layers.value.filter(candidate => candidate.id !== layer.id)
  }
  ctx.wrappedItems.deleteLayer(layer.collectionName, layer.id)
  const store = ctx.getStore()
  store.$hooks.callHookSync('cacheLayerRemove', { store, layer })
}

/** Apply bridge-owned reset state before forwarding reset hooks. */
function handleReset(ctx: CacheRuntime, payload: EngineResetPayload): void {
  if (payload.collection) {
    const collectionName = payload.collection.name
    ctx.visibleListCache.delete(collectionName)
    ctx.wrappedItems.deleteCollection(collectionName)
    clearQueryStateForCollection(ctx, collectionName)
  }
  else {
    ctx.visibleListCache.clear()
    ctx.wrappedItems.clear()
    clearAllQueryState(ctx)
  }
  refreshLayerMirrors(ctx)
  ctx.signals.reset()
  ctx.versions.reset()
  if (payload.source === 'clearCollection') {
    return
  }
  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheReset', { store, meta: {} })
}

/** Remove stale devtools layer mirror entries without exposing engine maps. */
function refreshLayerMirrors(ctx: CacheRuntime): void {
  for (const [collectionName, layers] of Object.entries(ctx.layers)) {
    layers.value = layers.value.filter((layer) => {
      const active = ctx.engine.getLayer(layer.id)
      return active?.collectionName === collectionName
    })
  }
}

/** Resolve an item primary key or throw a cache-friendly error. */
export function getItemKey(
  collection: ResolvedCollection<any, any, any>,
  item: ResolvedCollectionItem<any, any, any>,
): string | number {
  const key = collection.getKey(item)
  if (!isKeyDefined(key)) {
    throw new Error(`Item does not have a key for collection ${collection.name}: ${item}`)
  }
  return key
}

/** Read one resolved raw engine value through public engine API. */
export function readRawCacheItem(
  ctx: CacheRuntime,
  collection: ResolvedCollection<any, any, any>,
  key: string | number,
): any | undefined {
  return ctx.engine.readItemRaw({ collection, key })
}

/** Ensure devtools layer mirror for a collection exists. */
export function ensureLayersForCollection(ctx: CacheRuntime, collectionName: string) {
  return ctx.layers[collectionName] ??= shallowRef<CacheLayer[]>([])
}
