import type { EngineContext, QueuedOperation, Staggering } from './types.js'
import { addLayerNow, removeLayerNow } from './layers.js'
import { clearNow, setStateNow } from './serialize.js'
import { deleteItemFromBase, writeItemNow } from './write.js'

/**
 * Create the write-staggering controller. When `cacheStaggering > 0`, at most
 * that many writes are applied per 10ms window so a flood of cache writes does
 * not block the main thread; the budget refills on a timer that re-runs the
 * flush. `0` disables staggering entirely (writes apply immediately).
 */
export function createStaggering(cacheStaggering: number): Staggering {
  const budgetMax = Math.max(0, Math.floor(cacheStaggering))
  let budget = budgetMax
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  let flush: (() => void) | undefined

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
      if (!budgetMax) {
        return true
      }
      if (budget > 0) {
        return true
      }
      scheduleReset()
      return false
    },
    consume() {
      if (!budgetMax) {
        return
      }
      scheduleReset()
      budget = Math.max(0, budget - 1)
    },
    setFlush(fn) {
      flush = fn
    },
    dispose() {
      // Cancel a pending budget refill so it can't re-drive a torn-down engine.
      if (resetTimer) {
        clearTimeout(resetTimer)
        resetTimer = undefined
      }
    },
  }
}

/**
 * Push an operation onto the FIFO queue and, unless paused, drain it.
 */
export function enqueueOperation(ctx: EngineContext, operation: QueuedOperation): void {
  ctx.queue.push(operation)
  if (!ctx.paused) {
    flushQueuedOperations(ctx)
  }
}

/**
 * Drain the operation queue in FIFO order, applying each op to the engine
 * state. Honors the staggering budget: when exhausted, returns early leaving
 * the remainder queued (the budget-reset timer re-invokes this). Observer
 * notifications accumulated during applied ops are dispatched once in the
 * `finally`, after the flush guard is released so reactive callbacks may
 * safely enqueue further work.
 */
export function flushQueuedOperations(ctx: EngineContext): void {
  if (ctx.isFlushingQueue || ctx.paused) {
    return
  }

  ctx.isFlushingQueue = true
  try {
    while (ctx.queue.length) {
      const operation = ctx.queue[0]!
      switch (operation.type) {
        case 'writeItem':
          if (!ctx.staggering.canProcess()) {
            return
          }
          writeItemNow(ctx, operation.params)
          ctx.staggering.consume()
          ctx.queue.shift()
          break
        case 'writeItems':
          while (operation.index < operation.params.items.length) {
            if (!ctx.staggering.canProcess()) {
              return
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
            ctx.staggering.consume()
          }
          // Marker + the single batch-level write callback fire only after the
          // whole batch has been applied.
          if (operation.params.marker) {
            ctx.markers[operation.params.marker] = true
            ctx.observers.touchList(operation.params.collection.name)
          }
          ctx.callbacks.onAfterWrite?.({
            collection: operation.params.collection,
            result: operation.params.items,
            marker: operation.params.marker,
            operation: 'write',
          })
          ctx.queue.shift()
          break
        case 'deleteItem': {
          const { collection, key, deletedAt } = operation.params
          // Field timestamps are always cleared on delete; a tombstone is only
          // recorded when an explicit delete time is provided.
          const collectionTs = ctx.fieldTimestamps.get(collection.name)
          if (collectionTs) {
            collectionTs.delete(key)
          }
          if (deletedAt != null) {
            ctx.tombstones.set({ collection: collection.name, key, deletedAt })
          }
          deleteItemFromBase(ctx, operation.params)
          ctx.queue.shift()
          break
        }
        case 'addLayer':
          addLayerNow(ctx, operation.layer)
          ctx.queue.shift()
          break
        case 'removeLayer':
          removeLayerNow(ctx, operation.layerId)
          ctx.queue.shift()
          break
        case 'setState':
          setStateNow(ctx, operation.state)
          ctx.queue.shift()
          break
        case 'clear':
          clearNow(ctx)
          ctx.queue.shift()
          break
      }
    }
  }
  finally {
    ctx.isFlushingQueue = false
    ctx.observers.flush()
  }
}
