import type { ChangeRecorder, FlushChangeRecorder } from './change-recorder.js'
import type { EngineContext, EngineEffect, QueuedOperation } from './internal-types.js'
import { createChangeRecorder, createFlushChangeRecorder, discardStateChangeSink, recordList } from './change-recorder.js'
import { throwCollectedErrors } from './effects.js'
import { getPublicKey, toKeyId } from './identity.js'
import { sweepEmptyIndexBuckets } from './index-sweep.js'
import { addLayerNow, removeLayerNow } from './layers.js'
import { appendError, dispatchCommitted, dispatchFinalObservers } from './queue-dispatch.js'
import { clearCollectionNow, clearNow, setStateNow } from './serialize.js'
import { createWriteEffects } from './write-effects.js'
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
    if (ctx.queueHead || ctx.queue.length)
      compactQueue(ctx)
    if (ctx.indexSweepCandidates.size)
      sweepEmptyIndexBuckets(ctx)
    if (flushChanges.changes)
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
  try {
    const result = writeItemNow(ctx, changes, operation.params)
    dispatchCommitted(ctx, changes, result.effects)
  }
  catch (error) {
    discardStateChangeSink(changes)
    throw error
  }
}

/** Process one operation or one staggered batch item. */
function processOperation(
  ctx: EngineContext,
  operation: QueuedOperation,
  flushChanges: FlushChangeRecorder,
): boolean {
  switch (operation.type) {
    case 'writeItem': {
      if (!ctx.staggering.canProcess())
        return false
      const changes = createChangeRecorder(ctx, flushChanges)
      try {
        const result = writeItemNow(ctx, changes, operation.params)
        ctx.staggering.consume()
        advance(ctx)
        dispatchCommitted(ctx, changes, result.effects)
        return true
      }
      catch (error) {
        discardStateChangeSink(changes)
        throw error
      }
    }
    case 'writeItems':
      return processBatch(ctx, operation, flushChanges)
    case 'deleteItem': {
      const changes = createChangeRecorder(ctx, flushChanges)
      const { collection, key, deletedAt } = operation.params
      const state = ctx.collections.get(collection.name)
      const id = toKeyId(key)
      const publicKey = state ? getPublicKey(state, id) : key
      ctx.fieldTimestamps.get(collection.name)?.delete(id)
      if (deletedAt != null)
        ctx.tombstones.set({ collection: collection.name, key: publicKey, deletedAt })
      try {
        const result = deleteItemFromBase(ctx, changes, operation.params)
        advance(ctx)
        dispatchCommitted(ctx, changes, result.effects)
        return true
      }
      catch (error) {
        discardStateChangeSink(changes)
        throw error
      }
    }
    case 'addLayer':
      return processSimple(ctx, flushChanges, changes => addLayerNow(ctx, changes, operation.layer))
    case 'removeLayer':
      return processSimple(ctx, flushChanges, changes => removeLayerNow(ctx, changes, operation.layerId))
    case 'setState':
      return processSimple(ctx, flushChanges, changes => setStateNow(ctx, changes, operation.state))
    case 'clearCollection':
      return processSimple(ctx, flushChanges, changes => clearCollectionNow(ctx, changes, operation.collection))
    case 'clear':
      return processSimple(ctx, flushChanges, changes => clearNow(ctx, changes))
  }
}

/** Create, commit, and safely discard one simple operation recorder. */
function processSimple(
  ctx: EngineContext,
  flushChanges: FlushChangeRecorder,
  commit: (changes: ChangeRecorder | undefined) => EngineEffect[],
): true {
  const changes = createChangeRecorder(ctx, flushChanges)
  try {
    return commitSimple(ctx, changes, commit(changes))
  }
  catch (error) {
    discardStateChangeSink(changes)
    throw error
  }
}

/** Advance and dispatch one non-staggered committed operation. */
function commitSimple(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
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
  let skipItemRecorders = false
  while (operation.index < operation.params.items.length) {
    if (!ctx.staggering.canProcess())
      return false
    const changes = skipItemRecorders ? undefined : createChangeRecorder(ctx, flushChanges)
    // Batch items dispatch no hooks until aggregate completion, so consumer
    // interest cannot change synchronously between unobserved item commits.
    if (!changes)
      skipItemRecorders = true
    const { key, value } = operation.params.items[operation.index]!
    try {
      const result = writeItemNow(ctx, changes, {
        collection: operation.params.collection,
        key,
        item: value,
        meta: operation.params.meta,
        fromWriteItems: true,
      })
      operation.index++
      if (result.change && operation.changes)
        operation.changes.push(result.change)
      ctx.staggering.consume()
      dispatchCommitted(ctx, changes, result.effects)
    }
    catch (error) {
      discardStateChangeSink(changes)
      throw error
    }
  }

  const changes = createChangeRecorder(ctx, flushChanges)
  if (operation.params.marker !== undefined) {
    ctx.markers[operation.params.marker] = true
    recordList(changes, operation.params.collection.name)
  }
  const effects = createWriteEffects(ctx, {
    collection: operation.params.collection,
    result: operation.params.items,
    marker: operation.params.marker,
    operation: 'write',
  }, operation.changes)
  advance(ctx)
  try {
    dispatchCommitted(ctx, changes, effects)
  }
  catch (error) {
    discardStateChangeSink(changes)
    throw error
  }
  return true
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
