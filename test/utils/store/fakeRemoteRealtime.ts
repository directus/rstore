import type { FieldTimestamps, FieldTimestampValue } from '@rstore/shared'

/**
 * Realtime frame delivery for {@link import('./fakeRemote').createFakeRemote}.
 *
 * Frames land through `store.$cache.writeItem({ ..., fieldTimestamps })` and
 * `store.$cache.deleteItem({ ..., deletedAt })` — the exact contract real
 * connectors use (`packages/nuxt-drizzle/src/runtime/plugin-realtime.ts:137`).
 * Writing through `store.$collection(c).writeItem(item)` instead, as this
 * harness used to, bypasses CRDT field merge and tombstones, so no test above
 * the connector could fail when that path broke.
 */

/** A realtime frame pushed into open subscriptions by `FakeRemote.emit`. */
export type FakeRemoteFrame
  = | {
    type: 'created' | 'updated'
    collection: string
    item: Record<string, any>
    /** Per-field causal stamps, for field-level last-writer-wins merge. */
    fieldTimestamps?: FieldTimestamps
    /** Origin of the change; a frame matching the remote's own id is dropped. */
    clientId?: string
  }
  | {
    type: 'deleted'
    collection: string
    key: string | number
    /** Causal stamp of the delete, recorded as a tombstone. */
    deletedAt?: FieldTimestampValue
    /** Origin of the change; a frame matching the remote's own id is dropped. */
    clientId?: string
  }

/**
 * Applies a frame to a store cache the way a real connector does.
 *
 * No-ops when the store has no collection of that name, so a test can emit a
 * frame for a collection outside the schema without blowing up.
 *
 * @param store The store owning the subscription that received the frame.
 * @param frame The frame to apply.
 */
export function deliverFrame(store: any, frame: FakeRemoteFrame): void {
  const collection = store.$collections.find((candidate: any) => candidate.name === frame.collection)
  if (!collection) {
    return
  }

  if (frame.type === 'deleted') {
    store.$cache.deleteItem({
      collection,
      key: frame.key,
      deletedAt: frame.deletedAt,
    })
    return
  }

  const key = collection.getKey(frame.item)
  if (key == null) {
    throw new Error(`fake-remote: no key for a ${frame.type} frame of ${frame.collection}`)
  }
  store.$cache.writeItem({
    collection,
    key,
    item: frame.item,
    fieldTimestamps: frame.fieldTimestamps,
  })
}
