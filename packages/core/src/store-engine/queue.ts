import type { EngineContext, QueuedOperation, Staggering } from './types.js'
import { getPublicKey, toKeyId } from './identity.js'
import { addLayerNow, removeLayerNow } from './layers.js'
import { clearNow, setStateNow } from './serialize.js'
import { deleteItemFromBase, writeItemNow } from './write.js'

/** Create the cache write-staggering controller. */
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
      if (!budgetMax || budget > 0) {
        return true
      }
      scheduleReset()
      return false
    },
    consume() {
      if (budgetMax) {
        scheduleReset()
        budget = Math.max(0, budget - 1)
      }
    },
    setFlush(fn) {
      flush = fn
    },
    dispose() {
      if (resetTimer) {
        clearTimeout(resetTimer)
        resetTimer = undefined
      }
    },
  }
}

/** Add an operation and immediately drain unless the cache is paused. */
export function enqueueOperation(ctx: EngineContext, operation: QueuedOperation): void {
  ctx.queue.push(operation)
  if (!ctx.paused) {
    flushQueuedOperations(ctx)
  }
}

/** Advance past a fully processed operation without shifting the array. */
function advance(ctx: EngineContext): void {
  ctx.queueHead++
}

/** Compact consumed queue storage at amortized O(1) cost. */
function compact(ctx: EngineContext): void {
  if (ctx.queueHead === ctx.queue.length) {
    ctx.queue.length = 0
    ctx.queueHead = 0
  }
  else if (ctx.queueHead >= 1024 && ctx.queueHead * 2 >= ctx.queue.length) {
    ctx.queue.splice(0, ctx.queueHead)
    ctx.queueHead = 0
  }
}

/** Apply queued operations in FIFO order and flush observers once per drain. */
export function flushQueuedOperations(ctx: EngineContext): void {
  if (ctx.isFlushingQueue || ctx.paused) {
    return
  }

  ctx.isFlushingQueue = true
  try {
    while (ctx.queueHead < ctx.queue.length) {
      const operation = ctx.queue[ctx.queueHead]!
      switch (operation.type) {
        case 'writeItem':
          if (!ctx.staggering.canProcess()) {
            return
          }
          writeItemNow(ctx, operation.params)
          ctx.staggering.consume()
          advance(ctx)
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
          advance(ctx)
          break
        case 'deleteItem': {
          const { collection, key, deletedAt } = operation.params
          const state = ctx.collections.get(collection.name)
          const id = toKeyId(key)
          const publicKey = state ? getPublicKey(state, id) : key
          ctx.fieldTimestamps.get(collection.name)?.delete(id)
          if (deletedAt != null) {
            ctx.tombstones.set({ collection: collection.name, key: publicKey, deletedAt })
          }
          deleteItemFromBase(ctx, operation.params)
          advance(ctx)
          break
        }
        case 'addLayer':
          addLayerNow(ctx, operation.layer)
          advance(ctx)
          break
        case 'removeLayer':
          removeLayerNow(ctx, operation.layerId)
          advance(ctx)
          break
        case 'setState':
          setStateNow(ctx, operation.state)
          advance(ctx)
          break
        case 'clear':
          clearNow(ctx)
          advance(ctx)
          break
      }
    }
  }
  finally {
    ctx.isFlushingQueue = false
    compact(ctx)
    ctx.observers.flush()
  }
}
