import type { CacheRuntime } from './types'
import { runSyncTask, throwSyncErrors } from './syncErrors'

/** Synchronize one exact index commit without aggregate Map/Set projection. */
export function synchronizeBridgeIndex(ctx: CacheRuntime, dependency: string): void {
  let errors: unknown[] | undefined
  errors = runSyncTask(() => ctx.indexResultCache.invalidate(dependency), errors)
  errors = runSyncTask(() => ctx.versions.flushIndex(dependency), errors)
  errors = runSyncTask(() => ctx.signals.flushIndex(dependency), errors)
  throwSyncErrors(errors, 'Vue cache synchronization failed')
}
