import type { SubscriptionUpdateMessage } from './realtime'

/**
 * Write one realtime frame into the store cache. Protocol v2 stamps travel as
 * cache write metadata (`{ fieldTimestamps }` / `{ deletedAt }`), merged by
 * `createMultiplayerPlugin()` from `@rstore/multiplayer` (installed by the
 * module unless `ws.lww` is `false`). Without the plugin, stamped frames
 * overwrite and the cache warns about the unhandled metadata in dev.
 *
 * @param store Store receiving the frame.
 * @param update Frame from the realtime WebSocket.
 */
export function applyRealtimeUpdate(store: any, update: SubscriptionUpdateMessage): void {
  const collection = store.$collections.find((c: any) => c.name === update.collection)
  if (!collection) {
    throw new Error(`Collection ${update.collection} not found`)
  }

  if (update.type === 'deleted') {
    if (update.key == null) {
      throw new Error(`Key not found for collection ${collection.name}`)
    }
    store.$cache.deleteItem({
      collection,
      key: update.key,
      metadata: update.deletedAt != null ? { deletedAt: update.deletedAt } : undefined,
    })
    return
  }

  const key = collection.getKey(update.record)
  if (key == null) {
    throw new Error(`Key not found for collection ${collection.name}`)
  }
  store.$cache.writeItem({
    collection,
    key,
    item: update.record,
    metadata: update.fieldTimestamps ? { fieldTimestamps: update.fieldTimestamps } : undefined,
  })
}
