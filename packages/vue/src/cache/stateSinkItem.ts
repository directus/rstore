import type { CacheRuntime } from './types'
import { appendSyncError, throwSyncErrors } from './syncErrors'

/** Synchronize common one-item commits without aggregate Map/Set projection. */
export function synchronizeBridgeItem(
  ctx: CacheRuntime,
  collection: string,
  key: string,
  value: unknown,
  keyForm?: { previousKey: string | number, key: string | number },
): void {
  let errors: unknown[] | undefined
  errors = run(() => ctx.versions.flushItem(collection), errors)
  errors = run(() => ctx.signals.flushItem(collection, key), errors)
  errors = run(() => ctx.itemCells.flushItem(collection, key, value), errors)
  if (value === undefined)
    errors = run(() => ctx.wrappedItems.deleteBase(collection, key), errors)
  if (keyForm)
    errors = run(() => ctx.wrappedItems.deleteBase(collection, keyForm.previousKey), errors)
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
