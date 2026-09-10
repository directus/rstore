import type { CacheRuntime, CacheWriteBatch, QueuedOperation } from './types'
import { triggerRef } from 'vue'
import { ensureCollectionRef, evictCollectionStateCache, mark } from './context'
import { addLayerNow, removeLayer } from './layers'
import { clearNow, deleteItemNow, setStateNow, writeItemNow } from './writes'

/** Completed queue entry whose observer errors must not replay the write. */
interface CompletedOperation {
  /** Observer errors raised after data was written successfully. */
  settlementErrors: unknown[]
}

/** Enqueue an operation and flush it immediately when the cache is active. */
export function enqueueOperation(ctx: CacheRuntime, operation: QueuedOperation) {
  ctx.state.queue.push(operation)
  if (!ctx.state.paused) {
    flushQueuedOperations(ctx)
  }
}

/** Enqueue a collection write batch with its publication state. */
export function enqueueWriteItems(ctx: CacheRuntime, params: Extract<QueuedOperation, { type: 'writeItems' }>['params']) {
  enqueueOperation(ctx, {
    type: 'writeItems',
    params,
    index: 0,
    batch: {
      affectedCollections: new Set(),
      deferredAfterCacheWrites: [],
    },
  })
}

/** Flush queued cache operations while respecting pause and staggering state. */
export function flushQueuedOperations(ctx: CacheRuntime) {
  if (ctx.isFlushingQueue || ctx.state.paused) {
    return
  }

  ctx.isFlushingQueue = true
  const deferredErrors: unknown[] = []
  try {
    while (ctx.state.queue.length) {
      const operation = ctx.state.queue[0]!
      let result: boolean | CompletedOperation
      try {
        result = processQueuedOperation(ctx, operation)
      }
      catch (error) {
        throwWithSecondaryErrors(error, deferredErrors)
      }
      if (!result) {
        throwSettlementErrors(deferredErrors)
        return
      }
      ctx.state.queue.shift()
      if (result !== true) {
        deferredErrors.push(...result.settlementErrors)
      }
    }
    throwSettlementErrors(deferredErrors)
  }
  finally {
    ctx.isFlushingQueue = false
  }
}

function processQueuedOperation(ctx: CacheRuntime, operation: QueuedOperation) {
  switch (operation.type) {
    case 'writeItem':
      return processQueuedWriteItem(ctx, operation)
    case 'writeItems':
      return processQueuedWriteItems(ctx, operation)
    case 'deleteItem':
      processQueuedDelete(ctx, operation)
      return true
    case 'addLayer':
      addLayerNow(ctx, operation.layer)
      return true
    case 'removeLayer':
      removeLayer(ctx, operation.layerId)
      return true
    case 'setState':
      setStateNow(ctx, operation.state)
      return true
    case 'clear':
      clearNow(ctx)
      return true
  }
}

function processQueuedWriteItem(ctx: CacheRuntime, operation: Extract<QueuedOperation, { type: 'writeItem' }>) {
  // A paused or staggered write can outlive the query that queued it.
  if (operation.params.meta?.$canPublishQuery?.() === false) {
    return true
  }
  if (!canProcessQueuedWrite(ctx)) {
    return false
  }
  writeItemNow(ctx, operation.params)
  consumeQueuedWrite(ctx)
  return true
}

function processQueuedWriteItems(ctx: CacheRuntime, operation: Extract<QueuedOperation, { type: 'writeItems' }>) {
  // A stale page that has not started can be discarded without publication.
  // Once a staggered slice wrote raw state, settle it so readers and nested
  // hooks cannot remain behind the cache. The marker and outer hook stay stale.
  if (operation.params.meta?.$canPublishQuery?.() === false) {
    return operation.index === 0
      ? true
      : { settlementErrors: settleWriteBatch(ctx, operation.batch) }
  }
  try {
    while (operation.index < operation.params.items.length) {
      if (!canProcessQueuedWrite(ctx)) {
        return false
      }
      const { key, value: item } = operation.params.items[operation.index]!
      writeItemNow(ctx, {
        collection: operation.params.collection,
        key,
        item,
        meta: operation.params.meta,
        fromWriteItems: true,
        batch: operation.batch,
      })
      operation.index++
      consumeQueuedWrite(ctx)
    }
  }
  catch (error) {
    throwWithSecondaryErrors(error, settleWriteBatch(ctx, operation.batch))
  }
  if (operation.params.marker) {
    mark(ctx, operation.params.marker)
  }

  const settlementErrors = settleWriteBatch(ctx, operation.batch)
  const store = ctx.getStore()
  try {
    store.$hooks.callHookSync('afterCacheWrite', {
      store,
      meta: {},
      collection: operation.params.collection,
      result: operation.params.items,
      marker: operation.params.marker,
      operation: 'write',
    })
  }
  catch (error) {
    settlementErrors.push(error)
  }
  return { settlementErrors }
}

/** Publish data before invoking deferred nested hooks, collecting observer failures. */
function settleWriteBatch(ctx: CacheRuntime, batch: CacheWriteBatch) {
  const errors = publishWriteBatch(ctx, batch)
  const deferredAfterCacheWrites = batch.deferredAfterCacheWrites.splice(0)
  const store = ctx.getStore()
  for (const payload of deferredAfterCacheWrites) {
    try {
      store.$hooks.callHookSync('afterCacheWrite', payload)
    }
    catch (error) {
      errors.push(error)
    }
  }
  return errors
}

/** Notify each affected collection once, continuing past failing observers. */
function publishWriteBatch(ctx: CacheRuntime, batch: CacheWriteBatch) {
  const errors: unknown[] = []
  try {
    for (const collectionName of batch.affectedCollections) {
      evictCollectionStateCache(ctx, collectionName)
      try {
        triggerRef(ensureCollectionRef(ctx, collectionName))
      }
      catch (error) {
        errors.push(error)
      }
    }
  }
  finally {
    batch.affectedCollections.clear()
  }
  return errors
}

/** Keep the write failure primary when publication also fails. */
function throwWithSecondaryErrors(primaryError: unknown, secondaryErrors: unknown[]): never {
  if (!secondaryErrors.length) {
    throw primaryError
  }
  throw new AggregateError(
    [primaryError, ...secondaryErrors],
    'Cache operation failed and batch settlement reported additional errors',
    { cause: primaryError },
  )
}

/** Surface observer failures after completed queue entries are removed. */
function throwSettlementErrors(errors: unknown[]) {
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Cache batch settlement reported multiple errors', { cause: errors[0] })
  }
}

function processQueuedDelete(ctx: CacheRuntime, operation: Extract<QueuedOperation, { type: 'deleteItem' }>) {
  const { collection, key, deletedAt } = operation.params
  const collectionTs = ctx.state.fieldTimestamps.get(collection.name)
  if (collectionTs) {
    collectionTs.delete(key)
  }
  if (deletedAt != null) {
    ctx.state.tombstones.set({
      collection: collection.name,
      key,
      deletedAt,
    })
  }
  deleteItemNow(ctx, collection, key)
}

function scheduleStaggeringBudgetReset(ctx: CacheRuntime) {
  if (!ctx.cacheStaggering || ctx.staggeringResetTimer) {
    return
  }
  ctx.staggeringResetTimer = setTimeout(() => {
    ctx.staggeringResetTimer = undefined
    ctx.staggeringBudget = ctx.cacheStaggering
    if (!ctx.state.paused) {
      flushQueuedOperations(ctx)
    }
  }, 10)
}

function canProcessQueuedWrite(ctx: CacheRuntime) {
  if (!ctx.cacheStaggering || ctx.staggeringBudget > 0) {
    return true
  }
  scheduleStaggeringBudgetReset(ctx)
  return false
}

function consumeQueuedWrite(ctx: CacheRuntime) {
  if (!ctx.cacheStaggering) {
    return
  }
  scheduleStaggeringBudgetReset(ctx)
  ctx.staggeringBudget = Math.max(0, ctx.staggeringBudget - 1)
}
