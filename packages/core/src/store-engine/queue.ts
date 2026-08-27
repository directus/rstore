import type { ChangeRecorder, FlushChangeRecorder } from './change-recorder.js'
import type { EngineContext, EngineEffect, QueuedOperation } from './internal-types.js'
import { createChangeRecorder, createFlushChangeRecorder, getFlushChanges, getOperationChanges, recordList } from './change-recorder.js'
import { dispatchEffects, throwCollectedErrors } from './effects.js'
import { getPublicKey, toKeyId } from './identity.js'
import { sweepEmptyIndexBuckets } from './indexes.js'
import { addLayerNow, removeLayerNow } from './layers.js'
import { clearCollectionNow, clearNow, setStateNow } from './serialize.js'
import { deleteItemFromBase, writeItemNow } from './write.js'

/** Add an operation and drain immediately at pause depth zero. */
export function enqueueOperation(ctx: EngineContext, operation: QueuedOperation): void {
  if (canRunDirectWrite(ctx, operation)) {
    flushQueuedOperations(ctx, operation)
    return
  }
  ctx.queue.push(operation)
  if (ctx.pauseDepth === 0)
    flushQueuedOperations(ctx)
}

/** Drain FIFO operations until paused, staggered, or one callback fails. */
export function flushQueuedOperations(
  ctx: EngineContext,
  directWrite?: Extract<QueuedOperation, { type: 'writeItem' }>,
): void {
  if (ctx.isFlushingQueue || ctx.pauseDepth > 0)
    return
  const flushChanges = createFlushChangeRecorder()
  let errors: unknown[] | undefined
  ctx.isFlushingQueue = true
  try {
    if (directWrite) {
      try {
        processDirectWrite(ctx, directWrite, flushChanges)
      }
      catch (error) {
        errors = appendError(errors, error)
      }
    }
    while (ctx.queueHead < ctx.queue.length) {
      if (errors)
        break
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
        errors = appendError(errors, error)
        break
      }
    }
  }
  finally {
    ctx.isFlushingQueue = false
    compactQueue(ctx)
    sweepEmptyIndexBuckets(ctx)
    errors = dispatchFinalObservers(ctx, flushChanges, errors)
  }
  throwCollectedErrors(errors, 'Store engine callbacks failed')
}

/** Return whether one write can bypass queue storage and cursor handling. */
function canRunDirectWrite(
  ctx: EngineContext,
  operation: QueuedOperation,
): operation is Extract<QueuedOperation, { type: 'writeItem' }> {
  return operation.type === 'writeItem'
    && !ctx.staggering.enabled
    && !ctx.isFlushingQueue
    && ctx.pauseDepth === 0
    && ctx.queueHead >= ctx.queue.length
}

/** Commit one unqueued write while preserving normal reentrant drain semantics. */
function processDirectWrite(
  ctx: EngineContext,
  operation: Extract<QueuedOperation, { type: 'writeItem' }>,
  flushChanges: FlushChangeRecorder,
): void {
  const changes = createChangeRecorder(ctx, flushChanges)
  const result = writeItemNow(ctx, changes, operation.params)
  dispatchCommitted(ctx, changes, result.effects)
}

/** Process one operation or one staggered batch item. */
function processOperation(
  ctx: EngineContext,
  operation: QueuedOperation,
  flushChanges: FlushChangeRecorder,
): boolean {
  const changes = createChangeRecorder(ctx, flushChanges)
  switch (operation.type) {
    case 'writeItem': {
      if (!ctx.staggering.canProcess())
        return false
      const result = writeItemNow(ctx, changes, operation.params)
      ctx.staggering.consume()
      advance(ctx)
      dispatchCommitted(ctx, changes, result.effects)
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
      dispatchCommitted(ctx, changes, result.effects)
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
  changes: ChangeRecorder | undefined,
  flushChanges: FlushChangeRecorder,
  effects: EngineEffect[],
): true {
  advance(ctx)
  dispatchCommitted(ctx, changes, effects)
  return true
}

/** Process available batch items and dispatch one aggregate write hook. */
function processBatch(
  ctx: EngineContext,
  operation: Extract<QueuedOperation, { type: 'writeItems' }>,
  flushChanges: FlushChangeRecorder,
): boolean {
  while (operation.index < operation.params.items.length) {
    if (!ctx.staggering.canProcess())
      return false
    const changes = createChangeRecorder(ctx, flushChanges)
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
    dispatchCommitted(ctx, changes, result.effects)
  }

  const changes = createChangeRecorder(ctx, flushChanges)
  if (operation.params.marker !== undefined) {
    ctx.markers[operation.params.marker] = true
    recordList(changes, operation.params.collection.name)
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
  dispatchCommitted(ctx, changes, [effect])
  return true
}

/** Publish framework state before hooks, collecting every callback failure. */
function dispatchCommitted(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  effects: readonly EngineEffect[],
): void {
  let errors: unknown[] | undefined
  const operationChanges = getOperationChanges(changes)
  if (operationChanges) {
    try {
      ctx.callbacks.onStateChange?.(operationChanges)
    }
    catch (error) {
      errors = appendError(errors, error)
    }
  }
  try {
    dispatchEffects(ctx, effects)
  }
  catch (error) {
    for (const nested of error instanceof AggregateError ? error.errors : [error])
      errors = appendError(errors, nested)
  }
  throwCollectedErrors(errors, 'Store engine operation callbacks failed')
}

/** Run bridge flush then direct observers, even when bridge flush fails. */
function dispatchFinalObservers(
  ctx: EngineContext,
  flush: FlushChangeRecorder,
  errors: unknown[] | undefined,
): unknown[] | undefined {
  const changes = getFlushChanges(flush)
  if (!changes)
    return errors
  try {
    ctx.callbacks.onObserverFlush?.(changes)
  }
  catch (error) {
    errors = appendError(errors, error)
  }
  ctx.observers.dispatch(changes)
  return errors
}

/** Lazily allocate callback error storage. */
function appendError(errors: unknown[] | undefined, error: unknown): unknown[] {
  const result = errors ?? []
  result.push(error)
  return result
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
