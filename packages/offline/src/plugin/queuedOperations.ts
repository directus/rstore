import type { OfflinePluginRuntime, OfflineQueuedOperation } from './types'
import { createItem, createMany, deleteItem, deleteMany, updateItem, updateMany } from '@rstore/core'
import { getOfflineDb } from './metadata'

/** Register the hook that replays queued mutations during sync. */
export function installQueuedOperationSyncHook(runtime: OfflinePluginRuntime, hook: any) {
  hook('sync', async ({ store }: any) => {
    const db = getOfflineDb(runtime)
    const queuedOperations: OfflineQueuedOperation[] = await db.readAllItems(runtime.opsStoreName)
    queuedOperations.sort((a, b) => a.time.getTime() - b.time.getTime())
    for (const op of queuedOperations) {
      await processQueuedOperation(runtime, store, op)
    }
  })
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
  }
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
