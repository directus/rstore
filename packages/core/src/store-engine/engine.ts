import type { CacheLayer, FieldTimestampValue } from '@rstore/shared'
import type { EngineContext, EngineOptions, StoreEngine } from './types.js'
import { createTombstoneStore, gcTombstones as gcTombstonesStore, scheduleTombstoneGc } from '../tombstone.js'
import { getLayerNow } from './layers.js'
import { createObserverRegistry } from './observers.js'
import { createStaggering, enqueueOperation, flushQueuedOperations } from './queue.js'
import { getIndexBucket, getVisibleKeys, resolveItem } from './resolve.js'
import { getState as serializeState } from './serialize.js'
import { deleteItemFromBase, getFieldTimestamps, setFieldTimestamps } from './write.js'

/**
 * Create the framework-agnostic storage engine. All state lives in plain JS
 * structures; reactivity is delegated to subscribers via the observer
 * registry, so a host framework (e.g. `@rstore/vue`) can map observers onto
 * its own signals without the engine ever importing it.
 */
export function createStoreEngine(options: EngineOptions): StoreEngine {
  const {
    callbacks,
    cacheStaggering = 0,
    tombstoneGc = {},
    isServer = false,
  } = options

  const observers = createObserverRegistry()
  const staggering = createStaggering(cacheStaggering)
  const tombstones = createTombstoneStore()

  const ctx: EngineContext = {
    collections: new Map(),
    markers: {},
    modules: new Map(),
    fieldTimestamps: new Map(),
    tombstones,
    queryMeta: {},
    layerIdToCollection: new Map(),
    paused: false,
    queue: [],
    isFlushingQueue: false,
    callbacks,
    observers,
    staggering,
    ensureCollection: undefined as any,
  }

  // Lazily create a collection's plain-JS storage container.
  ctx.ensureCollection = (name) => {
    let collectionState = ctx.collections.get(name)
    if (!collectionState) {
      collectionState = { base: new Map(), indexes: new Map(), layers: [] }
      ctx.collections.set(name, collectionState)
    }
    return collectionState
  }

  // The staggering budget-reset timer re-drives the queue.
  staggering.setFlush(() => flushQueuedOperations(ctx))

  // Auto-GC keeps the tombstone store bounded in long-lived clients. Skipped
  // on the server (request-scoped cache) and where timers are unavailable.
  let stopTombstoneGc: (() => void) | undefined
  const canScheduleTombstoneGc = !isServer && typeof setInterval !== 'undefined'
  if (tombstoneGc !== false && canScheduleTombstoneGc) {
    stopTombstoneGc = scheduleTombstoneGc(tombstones, {
      intervalMs: tombstoneGc.intervalMs ?? 60_000,
      ttlMs: tombstoneGc.ttlMs ?? 24 * 60 * 60 * 1000,
    })
  }

  return {
    readItemRaw({ collection, key }) {
      return resolveItem(ctx, collection.name, key)
    },

    resolveKeys({ collection, marker, keys, indexKey, indexValue }) {
      // A list gated on an unset marker reads as empty (no fetch happened yet).
      if (marker && !ctx.markers[marker]) {
        return []
      }
      // Index lookups resolve to the bucket's key set.
      if (keys == null && indexKey != null) {
        const bucket = getIndexBucket(ctx, collection.name, indexKey, indexValue ?? '')
        return bucket ? Array.from(bucket) : []
      }
      if (keys != null) {
        return keys
      }
      return getVisibleKeys(ctx, collection.name)
    },

    getIndexBucket(collection, indexKey, indexValue) {
      return getIndexBucket(ctx, collection, indexKey, indexValue)
    },

    hasMarker(marker) {
      return ctx.markers[marker] === true
    },

    writeItem(params) {
      enqueueOperation(ctx, { type: 'writeItem', params })
    },

    writeItems(params) {
      enqueueOperation(ctx, { type: 'writeItems', params, index: 0 })
    },

    deleteItem(params) {
      enqueueOperation(ctx, { type: 'deleteItem', params })
    },

    writeItemForRelation({ parentCollection, relationKey, relation, childItem, meta }) {
      const possibleCollections = Object.keys(relation.to)
      const nestedItemCollection = ctx.callbacks.resolveChildCollection(childItem, possibleCollections)
      if (!nestedItemCollection) {
        throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
      }
      const nestedKey = nestedItemCollection.getKey(childItem)
      if (nestedKey == null) {
        throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
      }
      this.writeItem({
        collection: nestedItemCollection,
        key: nestedKey,
        item: childItem,
        meta,
      })
    },

    readFieldTimestamps({ collectionName, key }) {
      return getFieldTimestamps(ctx, collectionName, key)
    },

    writeFieldTimestamps({ collectionName, key, timestamps }) {
      setFieldTimestamps(ctx, collectionName, key, { ...timestamps })
    },

    getModuleState(name, key, initState) {
      const cacheKey = `${name}:${key}`
      let mod = ctx.modules.get(cacheKey)
      if (!mod) {
        mod = { value: initState }
        ctx.modules.set(cacheKey, mod)
      }
      return mod.value
    },

    getState() {
      return serializeState(ctx)
    },

    setState(state) {
      enqueueOperation(ctx, { type: 'setState', state })
    },

    clear() {
      enqueueOperation(ctx, { type: 'clear' })
    },

    clearCollection({ collection }) {
      ctx.fieldTimestamps.delete(collection.name)
      const tombs = Array.from(ctx.tombstones.entries(), ([, t]) => t)
        .filter(t => t.collection === collection.name)
      for (const t of tombs) {
        ctx.tombstones.clear(t.collection, t.key)
      }
      const collectionState = ctx.collections.get(collection.name)
      if (collectionState) {
        // Batch all deletes behind a single flush: enqueuing per key while
        // unpaused would drain + dispatch observers once per item (O(N) on
        // large collections). Pause around the loop, then flush once. If the
        // caller already paused, leave the deletes queued for their resume.
        const wasPaused = ctx.paused
        ctx.paused = true
        try {
          // Snapshot keys: each delete mutates `base` as the queue drains.
          for (const key of Array.from(collectionState.base.keys())) {
            enqueueOperation(ctx, { type: 'deleteItem', params: { collection, key } })
          }
        }
        finally {
          ctx.paused = wasPaused
          if (!wasPaused) {
            flushQueuedOperations(ctx)
          }
        }
      }
    },

    garbageCollectKey(collection, key) {
      const removed = deleteItemFromBase(ctx, { collection, key })
      if (removed) {
        ctx.observers.flush()
      }
      return removed
    },

    forEachKey(collection, cb) {
      const collectionState = ctx.collections.get(collection)
      if (!collectionState) {
        return
      }
      for (const key of Array.from(collectionState.base.keys())) {
        cb(key)
      }
    },

    addLayer(layer) {
      enqueueOperation(ctx, { type: 'addLayer', layer })
    },

    getLayer(layerId) {
      return getLayerNow(ctx, layerId)
    },

    removeLayer(layerId) {
      enqueueOperation(ctx, { type: 'removeLayer', layerId })
    },

    tombstones,

    gcTombstones(olderThan: FieldTimestampValue) {
      return gcTombstonesStore(ctx.tombstones, olderThan)
    },

    pause() {
      ctx.paused = true
    },

    resume() {
      ctx.paused = false
      flushQueuedOperations(ctx)
    },

    dispose() {
      stopTombstoneGc?.()
      stopTombstoneGc = undefined
      // Cancel any pending staggering budget-reset timer.
      staggering.dispose()
    },

    observeItem: observers.observeItem,
    observeList: observers.observeList,
    observeIndex: observers.observeIndex,

    _getLayers() {
      const result = new Map<string, CacheLayer[]>()
      for (const [name, collectionState] of ctx.collections) {
        result.set(name, collectionState.layers)
      }
      return result
    },

    _getQueryMeta() {
      return ctx.queryMeta
    },

    _ctx: ctx,
  }
}
