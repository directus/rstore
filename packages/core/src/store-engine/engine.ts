import type { FieldTimestampValue } from '@rstore/shared'
import type { EngineContext } from './internal-types.js'
import type { EngineOptions, StoreEngine } from './types.js'
import { createTombstoneStore, gcTombstones as gcTombstonesStore, scheduleTombstoneGc } from '../tombstone.js'
import { createEngineChangeSet, getIndexDependencyId as encodeIndexDependencyId, isChangeSetEmpty } from './change-set.js'
import { createEngineContext } from './context.js'
import { dispatchEffects, throwCollectedErrors } from './effects.js'
import { getPublicKey } from './identity.js'
import { getIndexBucket, getIndexBucketIds, getIndexObserverId } from './indexes.js'
import { getLayerNow } from './layers.js'
import { getModuleState } from './modules.js'
import { createObserverRegistry } from './observers.js'
import { createStaggering, enqueueOperation, flushQueuedOperations } from './queue.js'
import { resolveRelationWriteParams } from './relations.js'
import { getState as serializeState } from './serialize.js'
import { normalizeSnapshotInput } from './snapshot-input.js'
import { getVisibleKeys, resolveItem } from './view.js'
import { deleteItemFromBase, getFieldTimestamps, setFieldTimestamps } from './write.js'

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
      return state?.indexes.get(indexKey)?.dependencyIds.get(valueId)
        ?? encodeIndexDependencyId(collectionName, indexKey, valueId)
    },

    hasMarker(marker) {
      return ctx.markers[marker] === true
    },

    writeItem(params) {
      enqueueOperation(ctx, { type: 'writeItem', params })
    },

    writeItems(params) {
      enqueueOperation(ctx, { type: 'writeItems', params, index: 0, changes: [] })
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
      // Field timestamps intentionally outlive cache eviction: GC is not a
      // causal delete, so a later refill still merges against local history.
      const changes = createEngineChangeSet()
      const result = deleteItemFromBase(ctx, changes, { collection, key })
      if (result.removed) {
        dispatchImmediate(ctx, changes, result.effects)
      }
      return result.removed
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
    },

    observeItem: observers.observeItem,
    observeList: observers.observeList,
    observeIndex(collectionName, indexKey, indexValue, callback) {
      const observerId = getIndexObserverId(
        ctx.collections.get(collectionName),
        callbacks.getCollection(collectionName),
        indexKey,
        indexValue,
      )
      return observers.observeIndex(collectionName, indexKey, observerId, callback)
    },

    getQueryMeta() {
      return ctx.queryMeta
    },
  }

  return engine
}

/** Dispatch immediate GC effects and observers with queue-equivalent errors. */
function dispatchImmediate(
  ctx: EngineContext,
  changes: ReturnType<typeof createEngineChangeSet>,
  effects: Parameters<typeof dispatchEffects>[1],
): void {
  const errors: unknown[] = []
  if (!isChangeSetEmpty(changes)) {
    try {
      ctx.callbacks.onStateChange?.(changes)
    }
    catch (error) {
      errors.push(error)
    }
  }
  try {
    dispatchEffects(ctx, effects)
  }
  catch (error) {
    errors.push(error)
  }
  if (!isChangeSetEmpty(changes)) {
    try {
      ctx.callbacks.onObserverFlush?.(changes)
    }
    catch (error) {
      errors.push(error)
    }
    ctx.observers.dispatch(changes)
  }
  throwCollectedErrors(errors, 'Store engine callbacks failed')
}
