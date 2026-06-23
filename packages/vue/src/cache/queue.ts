import type { CacheRuntime, QueuedOperation } from './types'
import { mark } from './context'
import { addLayerNow, removeLayer } from './layers'
import { clearNow, deleteItemNow, setStateNow, writeItemNow } from './writes'

/** Enqueue an operation and flush it immediately when the cache is active. */
export function enqueueOperation(ctx: CacheRuntime, operation: QueuedOperation) {
  ctx.state.queue.push(operation)
  if (!ctx.state.paused) {
    flushQueuedOperations(ctx)
  }
}

/** Flush queued cache operations while respecting pause and staggering state. */
export function flushQueuedOperations(ctx: CacheRuntime) {
  if (ctx.isFlushingQueue || ctx.state.paused) {
    return
  }

  ctx.isFlushingQueue = true
  try {
    while (ctx.state.queue.length) {
      const operation = ctx.state.queue[0]!
      if (!processQueuedOperation(ctx, operation)) {
        return
      }
      ctx.state.queue.shift()
    }
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
  if (!canProcessQueuedWrite(ctx)) {
    return false
  }
  writeItemNow(ctx, operation.params)
  consumeQueuedWrite(ctx)
  return true
}

function processQueuedWriteItems(ctx: CacheRuntime, operation: Extract<QueuedOperation, { type: 'writeItems' }>) {
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
    })
    operation.index++
    consumeQueuedWrite(ctx)
  }
  if (operation.params.marker) {
    mark(ctx, operation.params.marker)
  }
  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheWrite', {
    store,
    meta: {},
    collection: operation.params.collection,
    result: operation.params.items,
    marker: operation.params.marker,
    operation: 'write',
  })
  return true
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
