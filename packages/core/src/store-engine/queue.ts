import type { EngineContext, QueuedOperation, Staggering } from './internal-types.js'
import { dispatchEffects, throwCollectedErrors } from './effects.js'
import { getPublicKey, toKeyId } from './identity.js'
import { addLayerNow, removeLayerNow } from './layers.js'
import { clearCollectionNow, clearNow, setStateNow } from './serialize.js'
import { deleteItemFromBase, writeItemNow } from './write.js'

/** Create the cache write-staggering controller. */
export function createStaggering(cacheStaggering: number): Staggering {
  const budgetMax = Math.max(0, Math.floor(cacheStaggering))
  let budget = budgetMax
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  let flush: (() => void) | undefined
  let disposed = false

  /** Schedule one budget reset and queue retry. */
  function scheduleReset(): void {
    if (!budgetMax || resetTimer) {
      return
    }
    resetTimer = setTimeout(() => {
      resetTimer = undefined
      budget = budgetMax
      flush?.()
    }, 10)
  }

  return {
    enabled: budgetMax > 0,
    canProcess() {
      if (disposed) {
        return true
      }
      if (!budgetMax || budget > 0) {
        return true
      }
      scheduleReset()
      return false
    },
    consume() {
      if (budgetMax && !disposed) {
        scheduleReset()
        budget = Math.max(0, budget - 1)
      }
    },
    setFlush(callback) {
      flush = callback
    },
    dispose() {
      disposed = true
      if (resetTimer) {
        clearTimeout(resetTimer)
        resetTimer = undefined
      }
    },
  }
}

/** Add an operation and drain immediately at pause depth zero. */
export function enqueueOperation(ctx: EngineContext, operation: QueuedOperation): void {
  ctx.queue.push(operation)
  if (ctx.pauseDepth === 0) {
    flushQueuedOperations(ctx)
  }
}

/** Drain FIFO operations until paused, staggered, or one callback fails. */
export function flushQueuedOperations(ctx: EngineContext): void {
  if (ctx.isFlushingQueue || ctx.pauseDepth > 0) {
    return
  }

  const errors: unknown[] = []
  ctx.isFlushingQueue = true
  try {
    while (ctx.queueHead < ctx.queue.length) {
      const operation = ctx.queue[ctx.queueHead]!
      const headBefore = ctx.queueHead
      const batchIndexBefore = operation.type === 'writeItems' ? operation.index : undefined
      try {
        if (!processOperation(ctx, operation)) {
          break
        }
      }
      catch (error) {
        // Drop a failed, unadvanced operation. Validation failures must not
        // poison the FIFO; partial internal failures must never replay writes.
        if (ctx.queueHead === headBefore
          && (operation.type !== 'writeItems' || operation.index === batchIndexBefore)) {
          advance(ctx)
        }
        // Callback failures already advanced a top-level cursor or a batch
        // item cursor. Leave later work queued for the next enqueue/resume.
        errors.push(error)
        break
      }
    }
  }
  finally {
    ctx.isFlushingQueue = false
    compactQueue(ctx)
    try {
      ctx.observers.flush()
    }
    catch (error) {
      errors.push(error)
    }
  }
  throwCollectedErrors(errors, 'Store engine callbacks failed')
}

/** Process one operation or one staggered batch item. */
function processOperation(ctx: EngineContext, operation: QueuedOperation): boolean {
  switch (operation.type) {
    case 'writeItem': {
      if (!ctx.staggering.canProcess()) {
        return false
      }
      const result = writeItemNow(ctx, operation.params)
      ctx.staggering.consume()
      advance(ctx)
      dispatchEffects(ctx, result.effects)
      return true
    }
    case 'writeItems':
      return processBatch(ctx, operation)
    case 'deleteItem': {
      const { collection, key, deletedAt } = operation.params
      const state = ctx.collections.get(collection.name)
      const id = toKeyId(key)
      const publicKey = state ? getPublicKey(state, id) : key
      ctx.fieldTimestamps.get(collection.name)?.delete(id)
      if (deletedAt != null) {
        ctx.tombstones.set({ collection: collection.name, key: publicKey, deletedAt })
      }
      const result = deleteItemFromBase(ctx, operation.params)
      advance(ctx)
      dispatchEffects(ctx, result.effects)
      return true
    }
    case 'addLayer': {
      const effects = addLayerNow(ctx, operation.layer)
      advance(ctx)
      dispatchEffects(ctx, effects)
      return true
    }
    case 'removeLayer': {
      const effects = removeLayerNow(ctx, operation.layerId)
      advance(ctx)
      dispatchEffects(ctx, effects)
      return true
    }
    case 'setState': {
      const effects = setStateNow(ctx, operation.state)
      advance(ctx)
      dispatchEffects(ctx, effects)
      return true
    }
    case 'clearCollection': {
      const effects = clearCollectionNow(ctx, operation.collection)
      advance(ctx)
      dispatchEffects(ctx, effects)
      return true
    }
    case 'clear': {
      const effects = clearNow(ctx)
      advance(ctx)
      dispatchEffects(ctx, effects)
      return true
    }
  }
}

/** Process available batch items and dispatch one final aggregate hook. */
function processBatch(
  ctx: EngineContext,
  operation: Extract<QueuedOperation, { type: 'writeItems' }>,
): boolean {
  while (operation.index < operation.params.items.length) {
    if (!ctx.staggering.canProcess()) {
      return false
    }
    const { key, value } = operation.params.items[operation.index]!
    const result = writeItemNow(ctx, {
      collection: operation.params.collection,
      key,
      item: value,
      meta: operation.params.meta,
      fromWriteItems: true,
    })
    operation.index++
    if (result.change) {
      operation.changes.push(result.change)
    }
    ctx.staggering.consume()
    // Cursor advances per committed item before callbacks. A failed nested
    // child hook therefore resumes at the next batch item, never this one.
    dispatchEffects(ctx, result.effects)
  }

  if (operation.params.marker !== undefined) {
    ctx.markers[operation.params.marker] = true
    ctx.observers.touchList(operation.params.collection.name)
  }
  const effect = {
    type: 'afterWrite' as const,
    payload: {
      collection: operation.params.collection,
      result: operation.params.items,
      marker: operation.params.marker,
      operation: 'write' as const,
      changes: operation.changes,
    },
  }
  advance(ctx)
  dispatchEffects(ctx, [effect])
  return true
}

/** Advance past a fully processed top-level operation. */
function advance(ctx: EngineContext): void {
  ctx.queueHead++
}

/** Compact consumed queue storage at amortized constant cost. */
function compactQueue(ctx: EngineContext): void {
  if (ctx.queueHead === ctx.queue.length) {
    ctx.queue.length = 0
    ctx.queueHead = 0
  }
  else if (ctx.queueHead >= 1024 && ctx.queueHead * 2 >= ctx.queue.length) {
    ctx.queue.splice(0, ctx.queueHead)
    ctx.queueHead = 0
  }
}
