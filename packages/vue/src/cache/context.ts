import type { CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema } from '@rstore/shared'
import type { CacheRuntime, CreateCacheOptions } from './types'
import { createTombstoneStore, isKeyDefined, scheduleTombstoneGc } from '@rstore/core'
import { ref } from 'vue'

/** Create the mutable runtime shared by all cache modules. */
export function createCacheRuntime<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>({
  getStore,
  cacheStaggering: rawCacheStaggering = 0,
  tombstoneGc = {},
  isServer = (import.meta as unknown as { server?: boolean }).server === true,
}: CreateCacheOptions<TSchema, TCollectionDefaults>): CacheRuntime<TSchema, TCollectionDefaults> {
  const cacheStaggering = Math.max(0, Math.floor(rawCacheStaggering))
  const runtime: CacheRuntime<TSchema, TCollectionDefaults> = {
    getStore,
    cacheStaggering,
    state: {
      markers: {},
      collections: {},
      collectionIndexes: new Map(),
      modules: {},
      queryMeta: {},
      pageRefs: new Map(),
      paused: false,
      queue: [],
      fieldTimestamps: new Map(),
      tombstones: createTombstoneStore(),
    },
    layers: {},
    layerIdToCollectionName: {},
    wrappedItems: new Map(),
    wrappedItemsMetadata: new Map(),
    wrappedItemKeysPerLayer: new Map(),
    collectionStateCache: new Map(),
    collectionStateCacheReactivityMarker: new Map(),
    isFlushingQueue: false,
    staggeringBudget: cacheStaggering,
  }

  const canScheduleTombstoneGc = !isServer && typeof setInterval !== 'undefined'
  if (tombstoneGc !== false && canScheduleTombstoneGc) {
    runtime.stopTombstoneGc = scheduleTombstoneGc(runtime.state.tombstones, {
      intervalMs: tombstoneGc.intervalMs ?? 60_000,
      ttlMs: tombstoneGc.ttlMs ?? 24 * 60 * 60 * 1000,
    })
  }

  return runtime
}

/** Ensure the reactivity marker for a collection overlay cache exists. */
export function ensureCollectionStateCacheReactivityMarker(ctx: CacheRuntime, collectionName: string) {
  let marker = ctx.collectionStateCacheReactivityMarker.get(collectionName)
  if (!marker) {
    marker = ref(0)
    ctx.collectionStateCacheReactivityMarker.set(collectionName, marker)
  }
  return marker
}

/** Drop a cached overlay state and notify reactive readers. */
export function invalidateCollectionStateCache(ctx: CacheRuntime, collectionName: string) {
  ctx.collectionStateCache.delete(collectionName)
  ensureCollectionStateCacheReactivityMarker(ctx, collectionName).value++
}

/** Build the cache key for a wrapped item proxy. */
export function getItemWrapKey(collection: ResolvedCollection<any, any, any>, key: string | number, layer: { id: string } | undefined) {
  return [layer?.id, collection.name, key].filter(Boolean).join(':')
}

/** Resolve an item primary key or throw a cache-friendly error. */
export function getItemKey(collection: ResolvedCollection<any, any, any>, item: ResolvedCollectionItem<any, any, any>): string | number {
  const key = collection.getKey(item)
  if (!isKeyDefined(key)) {
    throw new Error(`Item does not have a key for collection ${collection.name}: ${item}`)
  }
  return key
}

/** Track a wrapped item key so layer removal can evict its proxy. */
export function addWrappedItemKeyToLayer(ctx: CacheRuntime, layer: { id: string } | undefined, wrapKey: string) {
  if (!layer) {
    return
  }
  let keys = ctx.wrappedItemKeysPerLayer.get(layer.id)
  if (!keys) {
    keys = new Set()
    ctx.wrappedItemKeysPerLayer.set(layer.id, keys)
  }
  keys.add(wrapKey)
}

/** Ensure a collection state ref exists. */
export function ensureCollectionRef(ctx: CacheRuntime, collectionName: string) {
  if (!ctx.state.collections[collectionName]) {
    ctx.state.collections[collectionName] = ref({})
  }
  return ctx.state.collections[collectionName]
}

/** Mark a query marker as fetched. */
export function mark(ctx: CacheRuntime, marker: string) {
  ctx.state.markers[marker] = true
}

/** Get or create a collection index map. */
export function getCollectionIndex(ctx: CacheRuntime, collectionName: string, indexKey: string) {
  let collectionIndex = ctx.state.collectionIndexes.get(collectionName)
  if (!collectionIndex) {
    collectionIndex = new Map()
    ctx.state.collectionIndexes.set(collectionName, collectionIndex)
  }
  let index = collectionIndex.get(indexKey)
  if (!index) {
    index = new Map()
    collectionIndex.set(indexKey, index)
  }
  return index
}
