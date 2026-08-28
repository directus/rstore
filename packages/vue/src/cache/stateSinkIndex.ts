import type { CacheRuntime } from './types'
import { appendSyncError, throwSyncErrors } from './syncErrors'

/** Synchronize one exact index commit without aggregate Map/Set projection. */
export function synchronizeBridgeIndex(ctx: CacheRuntime, dependency: string): void {
  let errors: unknown[] | undefined
  errors = run(() => ctx.indexResultCache.invalidate(dependency), errors)
  errors = run(() => ctx.versions.flushIndex(dependency), errors)
  errors = run(() => ctx.signals.flushIndex(dependency), errors)
  throwSyncErrors(errors, 'Vue cache synchronization failed')
}

/** Execute one router sink while retaining failures for later sinks. */
function run(callback: () => void, errors: unknown[] | undefined): unknown[] | undefined {
  try {
    callback()
  }
  catch (error) {
    return appendSyncError(errors, error)
  }
  return errors
}
