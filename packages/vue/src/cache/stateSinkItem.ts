import type { CacheRuntime } from './types'
import { runSyncTask, throwSyncErrors } from './syncErrors'

/** Synchronize common one-item commits without aggregate Map/Set projection. */
export function synchronizeBridgeItem(
  ctx: CacheRuntime,
  collection: string,
  key: string,
  value: unknown,
  keyForm?: { previousKey: string | number, key: string | number },
): void {
  let errors: unknown[] | undefined
  errors = runSyncTask(() => ctx.versions.flushItem(collection), errors)
  errors = runSyncTask(() => ctx.signals.flushItem(collection, key), errors)
  errors = runSyncTask(() => ctx.itemCells.flushItem(collection, key, value), errors)
  if (value === undefined)
    errors = runSyncTask(() => ctx.wrappedItems.deleteBase(collection, key), errors)
  if (keyForm)
    errors = runSyncTask(() => ctx.wrappedItems.deleteBase(collection, keyForm.previousKey), errors)
  throwSyncErrors(errors, 'Vue cache synchronization failed')
}
