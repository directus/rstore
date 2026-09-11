import type { FieldTimestampValue } from '@rstore/shared'
import type { EngineOptions, StoreEngine } from './types.js'
import { createTombstoneStore, gcTombstones as gcTombstonesStore, scheduleTombstoneGc } from '../tombstone.js'
import { createChangeRecorder, createFlushChangeRecorder, discardStateChangeSink } from './change-recorder.js'
import { createEngineContext } from './context.js'
import { getFieldTimestamps, setFieldTimestamps } from './crdt-state.js'
import { getPublicKey, toKeyId } from './identity.js'
import { cacheIndexDependencyId } from './index-dependencies.js'
import { getIndexBucket, getIndexBucketIds, getIndexObserverId, getIndexRead, rebuildIndexes } from './indexes.js'
import { getLayerNow } from './layers.js'
import { getModuleState } from './modules.js'
import { createObserverRegistry } from './observers.js'
import { dispatchImmediate } from './queue-dispatch.js'
import { enqueueOperation, flushQueuedOperations } from './queue.js'
import { resolveRelationWriteParams } from './relations.js'
import { getState as serializeState } from './serialize.js'
import { normalizeSnapshotInput } from './snapshot-input.js'
import { createStaggering } from './staggering.js'
import { getVisibleKeyIds, getVisibleKeys, resolveItem, resolveItemById } from './view.js'
import { deleteItemFromBase } from './write.js'

/**
 * Create a framework-agnostic storage engine. Plain JS structures own state;
 * callbacks and observers let framework adapters project reactivity.
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
  const ctx = createEngineContext({ callbacks, observers, staggering, tombstones })
  staggering.setFlush(() => flushQueuedOperations(ctx))

  let stopTombstoneGc: (() => void) | undefined
  const canScheduleTombstoneGc = !isServer && typeof setInterval !== 'undefined'
  if (tombstoneGc !== false && canScheduleTombstoneGc) {
    stopTombstoneGc = scheduleTombstoneGc(tombstones, {
      intervalMs: tombstoneGc.intervalMs ?? 60_000,
      ttlMs: tombstoneGc.ttlMs ?? 24 * 60 * 60 * 1000,
    })
  }

  const engine: StoreEngine = {
    readItemRaw({ collection, key }) {
      return resolveItem(ctx, collection.name, key)
    },

    resolveKeys({ collection, marker, keys, indexKey, indexValue }) {
      if (marker !== undefined && !ctx.markers[marker]) {
        return []
      }
      if (keys == null && indexKey != null) {
        const state = ctx.collections.get(collection.name)
        const bucket = getIndexBucketIds(state, collection, indexKey, indexValue)
        if (!state || !bucket)
          return []
        return Array.from(bucket, id => getPublicKey(state, id))
      }
      return keys ?? getVisibleKeys(ctx, collection.name)
    },

    scanItemsRaw({ collection, marker, keys, indexKey, indexValue }, visit, onIndexDependency) {
      const state = ctx.collections.get(collection.name)
      let indexIds: ReadonlySet<string> | undefined
      if (keys == null && indexKey != null) {
        const read = getIndexRead(ctx, state, collection, indexKey, indexValue)
        if (onIndexDependency?.(read.dependency) === false)
          return
        indexIds = read.ids
      }
      if (marker !== undefined && !ctx.markers[marker])
        return
      if (!state)
        return

      if (keys != null) {
        for (const key of keys) {
          const item = resolveItem(ctx, collection.name, key)
          if (item !== undefined && visit(key, item) === false)
            break
        }
        return
      }

      const ids = indexKey != null ? indexIds : getVisibleKeyIds(state)
      const directDefaultKeys = state.layers.length === 0 && state.usesDefaultKey && !state.keyOverrides
      for (const id of ids ?? []) {
        const item = resolveItemById(state, id)
        if (item !== undefined) {
          // Ordinary default-key rows need no sparse-map or layer resolution:
          // write/hydration registration guarantees current item key identity.
          const publicKey = directDefaultKeys
            ? item.$overrideKey ?? item.id ?? item.__id ?? id
            : getPublicKey(state, id, item)
          if (visit(publicKey, item) === false)
            break
        }
      }
    },

    getIndexBucket(collectionName, indexKey, indexValue) {
      return getIndexBucket(
        ctx.collections.get(collectionName),
        callbacks.getCollection(collectionName),
        indexKey,
        indexValue,
      )
    },

    getIndexDependencyId(collectionName, indexKey, indexValue) {
      const state = ctx.collections.get(collectionName)
      const valueId = getIndexObserverId(
        state,
        callbacks.getCollection(collectionName),
        indexKey,
        indexValue,
      )
      return cacheIndexDependencyId(ctx, state?.indexes.get(indexKey), collectionName, indexKey, valueId)
    },

    hasMarker(marker) {
      return ctx.markers[marker] === true
    },

    writeItem(params) {
      enqueueOperation(ctx, { type: 'writeItem', params })
    },

    writeItems(params) {
      enqueueOperation(ctx, {
        type: 'writeItems',
        params,
        index: 0,
      })
    },

    deleteItem(params) {
      enqueueOperation(ctx, { type: 'deleteItem', params })
    },

    writeItemForRelation(params) {
      engine.writeItem(resolveRelationWriteParams(ctx, params))
    },

    readFieldTimestamps({ collectionName, key }) {
      return getFieldTimestamps(ctx, collectionName, key)
    },

    writeFieldTimestamps({ collectionName, key, timestamps }) {
      setFieldTimestamps(ctx, collectionName, key, { ...timestamps })
    },

    getModuleState(name, key, initState) {
      return getModuleState(ctx, name, key, initState)
    },

    getState() {
      return serializeState(ctx)
    },

    setState(state) {
      enqueueOperation(ctx, { type: 'setState', state: normalizeSnapshotInput(state) })
    },

    clear() {
      enqueueOperation(ctx, { type: 'clear' })
    },

    clearCollection({ collection }) {
      enqueueOperation(ctx, { type: 'clearCollection', collection })
    },

    garbageCollectKey(collection, key) {
      const state = ctx.collections.get(collection.name)
      // A visible optimistic patch/delete owns its base row until its layer is
      // removed; collecting it would make rollback lose authoritative data.
      if (state?.layeredKeyCounts?.has(toKeyId(key))) {
        return false
      }
      const flush = createFlushChangeRecorder()
      const changes = createChangeRecorder(ctx, flush)
      try {
        const result = deleteItemFromBase(ctx, changes, { collection, key })
        if (result.removed) {
          const timestamps = ctx.fieldTimestamps.get(collection.name)
          timestamps?.delete(toKeyId(key))
          if (timestamps?.size === 0)
            ctx.fieldTimestamps.delete(collection.name)
          dispatchImmediate(ctx, changes, flush, result.effects)
        }
        else {
          discardStateChangeSink(changes)
        }
        return result.removed
      }
      catch (error) {
        discardStateChangeSink(changes)
        throw error
      }
    },

    forEachKey(collectionName, callback) {
      const state = ctx.collections.get(collectionName)
      if (!state) {
        return
      }
      for (const id of Array.from(state.base.keys())) {
        callback(getPublicKey(state, id))
      }
    },

    rebuildIndexes() {
      for (const [name, state] of ctx.collections) {
        const collection = callbacks.getCollection(name)
        if (collection) {
          rebuildIndexes(collection, state)
        }
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
      ctx.pauseDepth++
    },

    resume() {
      if (ctx.pauseDepth > 0) {
        ctx.pauseDepth--
      }
      if (ctx.pauseDepth === 0) {
        flushQueuedOperations(ctx)
      }
    },

    dispose() {
      if (ctx.disposed) {
        return
      }
      ctx.disposed = true
      stopTombstoneGc?.()
      stopTombstoneGc = undefined
      staggering.dispose()
      observers.dispose()
      ctx.queue.length = 0
      ctx.queueHead = 0
      ctx.pauseDepth = 0
      ctx.pendingIndexDependencies.clear()
      callbacks.stateChangeSink?.discard()
    },

    observeItem: observers.observeItem,
    observeList: observers.observeList,
    observeIndex(collectionName, indexKey, indexValue, callback) {
      const state = ctx.collections.get(collectionName)
      const observerId = getIndexObserverId(
        state,
        callbacks.getCollection(collectionName),
        indexKey,
        indexValue,
      )
      cacheIndexDependencyId(ctx, state?.indexes.get(indexKey), collectionName, indexKey, observerId)
      return observers.observeIndex(collectionName, indexKey, observerId, callback)
    },

    getQueryMeta() {
      return ctx.queryMeta
    },
  }
  return engine
}
