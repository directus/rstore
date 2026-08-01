import type { OfflinePluginRuntime, OfflineQueuedOperation } from './types'
import { createItem, createMany, deleteItem, deleteMany, updateItem, updateMany } from '@rstore/core'
import { getOfflineDb } from './metadata'

/**
 * Replay the queued offline mutations against the remote source, oldest first.
 *
 * Must run BEFORE the remote collection pull (see `syncOrchestrator.ts`):
 * consumers of the `syncCollection` hook delete local keys missing on the
 * server, so pulling first would wipe offline-created items before their
 * queued create is ever sent.
 */
export async function replayQueuedOperations(runtime: OfflinePluginRuntime, store: any): Promise<void> {
  const db = getOfflineDb(runtime)
  const queuedOperations: OfflineQueuedOperation[] = await db.readAllItems(runtime.opsStoreName)
  queuedOperations.sort((a, b) => a.time.getTime() - b.time.getTime())
  for (const op of queuedOperations) {
    await processQueuedOperation(runtime, store, op)
  }
}

async function processQueuedOperation(runtime: OfflinePluginRuntime, store: any, op: OfflineQueuedOperation) {
  try {
    if (!navigator.onLine) {
      throw new Error('Went offline during processing queued operations')
    }
    const collection = store.$collections.find((c: any) => c.name === op.collectionName)
    if (!collection) {
      throw new Error(`[rstore/offline] Cannot process queued operation for unknown collection "${op.collectionName}"`)
    }
    await replayOperation(store, collection, op)
    await getOfflineDb(runtime).deleteItem(runtime.opsStoreName, op.id)
  }
  catch (error) {
    console.error('[rstore/offline] Failed to process queued operation', op, error)
    if (shouldDropFailedOperation(error)) {
      await getOfflineDb(runtime).deleteItem(runtime.opsStoreName, op.id)
    }
  }
}

/**
 * Whether a failed operation should be removed from the queue instead of retried.
 *
 * Replay is sequential, so an operation the server will never accept is not just
 * retried forever — it blocks everything queued behind it. Permanent client
 * errors are dropped; `401` (a token refresh may fix it), `408` and `429`
 * (explicit retry signals) and every server-side or network failure are kept.
 */
export function shouldDropFailedOperation(error: any): boolean {
  const status = error?.statusCode ?? error?.status ?? error?.response?.status
  if (typeof status !== 'number') {
    return false
  }
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429
}

async function replayOperation(store: any, collection: any, op: OfflineQueuedOperation) {
  switch (op.type) {
    case 'create':
      await createItem({
        store,
        collection,
        item: op.item,
      })
      break
    case 'update':
      await updateItem({
        store,
        collection,
        item: op.item,
        key: op.key!,
      })
      break
    case 'delete':
      await deleteItem({
        store,
        collection,
        key: op.key!,
      })
      break
    case 'createMany':
      await createMany({
        store,
        collection,
        items: op.items!,
      })
      break
    case 'updateMany':
      await updateMany({
        store,
        collection,
        items: op.items!,
      })
      break
    case 'deleteMany':
      await deleteMany({
        store,
        collection,
        keys: op.keys!,
      })
      break
  }
}
