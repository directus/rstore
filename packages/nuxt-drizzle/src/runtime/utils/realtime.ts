import type { RstoreDrizzleCondition } from './types'

/**
 * Discriminator for a realtime update frame. `created` has no `key` (it is
 * inferred from the `record`'s primary key on the client); `updated` and
 * `deleted` carry the canonical `key`.
 */
export type RstoreDrizzleRealtimeUpdateType = 'created' | 'updated' | 'deleted'

/**
 * Server → client `update` frame payload. Kept in a Nuxt / Nitro / Drizzle /
 * Vue free file so it can be consumed from a standalone realtime server.
 */
export interface RstoreDrizzleRealtimePayload<
  TRecord = any,
  TType extends RstoreDrizzleRealtimeUpdateType = RstoreDrizzleRealtimeUpdateType,
> {
  collection: string
  record: TRecord
  key: TType extends 'created' ? undefined : string
  type: TType
  /**
   * Optional id of the client that triggered this update. When set, the
   * realtime handler will skip forwarding the update to the peer whose
   * `clientId` matches — this avoids sending an optimistic-update echo back
   * to the originator.
   */
  originClientId?: string
}

export interface SubscriptionMessage {
  action: 'subscribe' | 'unsubscribe'
  collection: string
  key?: string | number
  where?: RstoreDrizzleCondition
}

/**
 * One-off init frame the client sends right after the socket opens so the
 * server can associate the peer with a stable client id (used for
 * skip-self echo suppression).
 */
export interface ClientInitMessage {
  clientId: string
}

export type SubscriptionUpdateMessage<TRecord = any> = RstoreDrizzleRealtimePayload<TRecord>

export function getSubscriptionId(message: SubscriptionMessage) {
  return [
    message.collection,
    message.key ?? '*',
    message.where ? JSON.stringify(message.where) : '*',
  ].join('|')
}

/**
 * Normalizes a subscription key to its canonical string form. Publishers
 * always emit string keys (via `normalizeKey` in the server helper), so a
 * subscription that arrived with a number must be coerced here to avoid a
 * `"42" !== 42` strict-equality miss.
 */
export function normalizeSubscriptionKey(key: string | number): string {
  return String(key)
}
