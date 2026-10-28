import type { CacheRuntime } from './types'

/**
 * Dispose the cache once: notify dispose observers, then release timers and
 * every bridge-owned registry, even when an observer fails.
 */
export function disposeCache(ctx: CacheRuntime): void {
  if (ctx.disposed) {
    return
  }
  ctx.disposed = true
  try {
    notifyDispose(ctx)
  }
  finally {
    ctx.stopQueryStateSweeps?.()
    ctx.stopQueryStateSweeps = undefined
    disposeCacheRuntime(ctx)
  }
}

/**
 * Notify every dispose observer, even when one fails. The first failure is
 * rethrown once all resources had a chance to release.
 */
function notifyDispose(ctx: CacheRuntime): void {
  const store = ctx.getStore()
  // Construction can fail before the cache receives its owning store.
  if (!store) {
    return
  }
  store.$hooks.callHookWith('dispose', (hooks) => {
    let firstError: unknown
    let failed = false
    for (const { callback } of hooks) {
      try {
        callback({ store })
      }
      catch (error) {
        if (!failed) {
          failed = true
          firstError = error
        }
      }
    }
    if (failed) {
      throw firstError
    }
  })
}

/** Release every bridge-owned registry without invoking reset hooks. */
function disposeCacheRuntime(ctx: CacheRuntime): void {
  ctx.trackingEffects.clear()
  ctx.engine.dispose()
  ctx.signals.dispose()
  ctx.versions.dispose()
  ctx.visibleListCache.clear()
  ctx.indexResultCache.dispose()
  ctx.itemCells.dispose()
  ctx.changeInterest.dispose()
  ctx.wrappedItems.clear()
  ctx.state.pageRefs.clear()
  for (const key of Object.keys(ctx.state.queryMeta)) {
    delete ctx.state.queryMeta[key]
  }
  for (const collectionName of Object.keys(ctx.layers)) {
    ctx.layers[collectionName]!.value = []
    delete ctx.layers[collectionName]
  }
}
