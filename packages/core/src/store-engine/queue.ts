import type { MutableEngineChangeSet } from './change-set.js'
import type { EngineContext, EngineEffect, QueuedOperation, Staggering } from './internal-types.js'
import { createEngineChangeSet, isChangeSetEmpty, mergeChangeSets, touchList } from './change-set.js'
import { dispatchEffects, throwCollectedErrors } from './effects.js'
import { getPublicKey, toKeyId } from './identity.js'
import { sweepEmptyIndexBuckets } from './indexes.js'
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
    if (!budgetMax || resetTimer)
      return
    resetTimer = setTimeout(() => {
      resetTimer = undefined
      budget = budgetMax
      flush?.()
    }, 10)
  }

  return {
    enabled: budgetMax > 0,
    canProcess() {
      if (disposed || !budgetMax || budget > 0)
        return true
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
      if (resetTimer)
        clearTimeout(resetTimer)
      resetTimer = undefined
    },
  }
}

/** Add an operation and drain immediately at pause depth zero. */
export function enqueueOperation(ctx: EngineContext, operation: QueuedOperation): void {
  ctx.queue.push(operation)
  if (ctx.pauseDepth === 0)
    flushQueuedOperations(ctx)
}

/** Drain FIFO operations until paused, staggered, or one callback fails. */
export function flushQueuedOperations(ctx: EngineContext): void {
  if (ctx.isFlushingQueue || ctx.pauseDepth > 0)
    return
  const flushChanges = createEngineChangeSet()
  const errors: unknown[] = []
  ctx.isFlushingQueue = true
  try {
    while (ctx.queueHead < ctx.queue.length) {
      const operation = ctx.queue[ctx.queueHead]!
      const headBefore = ctx.queueHead
      const batchIndexBefore = operation.type === 'writeItems' ? operation.index : undefined
      try {
        if (!processOperation(ctx, operation, flushChanges))
          break
      }
      catch (error) {
        // Validation failures did not commit; callback failures already moved
        // their cursor, preventing replay of committed state.
        if (ctx.queueHead === headBefore
          && (operation.type !== 'writeItems' || operation.index === batchIndexBefore)) {
          advance(ctx)
        }
        errors.push(error)
        break
      }
    }
  }
  finally {
    ctx.isFlushingQueue = false
    compactQueue(ctx)
    sweepEmptyIndexBuckets(ctx)
    dispatchFinalObservers(ctx, flushChanges, errors)
  }
  throwCollectedErrors(errors, 'Store engine callbacks failed')
}

/** Process one operation or one staggered batch item. */
function processOperation(
  ctx: EngineContext,
  operation: QueuedOperation,
  flushChanges: MutableEngineChangeSet,
): boolean {
  const changes = createEngineChangeSet()
  switch (operation.type) {
    case 'writeItem': {
      if (!ctx.staggering.canProcess())
        return false
      const result = writeItemNow(ctx, changes, operation.params)
      ctx.staggering.consume()
      advance(ctx)
      dispatchCommitted(ctx, changes, flushChanges, result.effects)
      return true
    }
    case 'writeItems':
      return processBatch(ctx, operation, flushChanges)
    case 'deleteItem': {
      const { collection, key, deletedAt } = operation.params
      const state = ctx.collections.get(collection.name)
      const id = toKeyId(key)
      const publicKey = state ? getPublicKey(state, id) : key
      ctx.fieldTimestamps.get(collection.name)?.delete(id)
      if (deletedAt != null)
        ctx.tombstones.set({ collection: collection.name, key: publicKey, deletedAt })
      const result = deleteItemFromBase(ctx, changes, operation.params)
      advance(ctx)
      dispatchCommitted(ctx, changes, flushChanges, result.effects)
      return true
    }
    case 'addLayer':
      return commitSimple(ctx, changes, flushChanges, addLayerNow(ctx, changes, operation.layer))
    case 'removeLayer':
      return commitSimple(ctx, changes, flushChanges, removeLayerNow(ctx, changes, operation.layerId))
    case 'setState':
      return commitSimple(ctx, changes, flushChanges, setStateNow(ctx, changes, operation.state))
    case 'clearCollection':
      return commitSimple(ctx, changes, flushChanges, clearCollectionNow(ctx, changes, operation.collection))
    case 'clear':
      return commitSimple(ctx, changes, flushChanges, clearNow(ctx, changes))
  }
}

/** Advance and dispatch one non-staggered committed operation. */
function commitSimple(
  ctx: EngineContext,
  changes: MutableEngineChangeSet,
  flushChanges: MutableEngineChangeSet,
  effects: EngineEffect[],
): true {
  advance(ctx)
  dispatchCommitted(ctx, changes, flushChanges, effects)
  return true
}

/** Process available batch items and dispatch one aggregate write hook. */
function processBatch(
  ctx: EngineContext,
  operation: Extract<QueuedOperation, { type: 'writeItems' }>,
  flushChanges: MutableEngineChangeSet,
): boolean {
  while (operation.index < operation.params.items.length) {
    if (!ctx.staggering.canProcess())
      return false
    const changes = createEngineChangeSet()
    const { key, value } = operation.params.items[operation.index]!
    const result = writeItemNow(ctx, changes, {
      collection: operation.params.collection,
      key,
      item: value,
      meta: operation.params.meta,
      fromWriteItems: true,
    })
    operation.index++
    if (result.change)
      operation.changes.push(result.change)
    ctx.staggering.consume()
    dispatchCommitted(ctx, changes, flushChanges, result.effects)
  }

  const changes = createEngineChangeSet()
  if (operation.params.marker !== undefined) {
    ctx.markers[operation.params.marker] = true
    touchList(changes, operation.params.collection.name)
  }
  const effect: EngineEffect = {
    type: 'afterWrite',
    payload: {
      collection: operation.params.collection,
      result: operation.params.items,
      marker: operation.params.marker,
      operation: 'write',
      changes: operation.changes,
    },
  }
  advance(ctx)
  dispatchCommitted(ctx, changes, flushChanges, [effect])
  return true
}

/** Publish framework state before hooks, collecting every callback failure. */
function dispatchCommitted(
  ctx: EngineContext,
  changes: MutableEngineChangeSet,
  flushChanges: MutableEngineChangeSet,
  effects: readonly EngineEffect[],
): void {
  if (flushChanges !== changes)
    mergeChangeSets(flushChanges, changes)
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
    errors.push(...error instanceof AggregateError ? error.errors : [error])
  }
  throwCollectedErrors(errors, 'Store engine operation callbacks failed')
}

/** Run bridge flush then direct observers, even when bridge flush fails. */
function dispatchFinalObservers(ctx: EngineContext, changes: MutableEngineChangeSet, errors: unknown[]): void {
  if (isChangeSetEmpty(changes))
    return
  try {
    ctx.callbacks.onObserverFlush?.(changes)
  }
  catch (error) {
    errors.push(error)
  }
  ctx.observers.dispatch(changes)
}

/** Advance past one fully processed top-level operation. */
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
