import type { FieldTimestamps, FieldTimestampValue } from '@rstore/shared'
import type { RstoreDrizzleCondition } from './types'

/**
 * Wire protocol version emitted by the client. Bumped from implicit v1 to
 * v2 when HLC-based field timestamps and tombstones were added. Servers
 * still accept v1 frames — the additional fields are optional.
 */
export const RSTORE_DRIZZLE_PROTOCOL_VERSION = 2

/**
 * Lowest protocol version this build accepts from a peer. Frames missing
 * a `v` field are treated as v1 (legacy clients).
 */
export const RSTORE_DRIZZLE_PROTOCOL_MIN_VERSION = 1

/**
 * Highest protocol version this build understands. Clients announcing a
 * version above this are rejected at init time so they never read v3+
 * frame shapes that would not be sent.
 */
export const RSTORE_DRIZZLE_PROTOCOL_MAX_VERSION = RSTORE_DRIZZLE_PROTOCOL_VERSION

/**
 * Discriminator for a realtime update frame.
 */
export type RstoreDrizzleRealtimeUpdateType = 'created' | 'updated' | 'deleted'

/**
 * Server → client `update` frame payload. Kept in a Nuxt / Nitro / Drizzle /
 * Vue free file so it can be consumed from a standalone realtime server.
 */
export interface RstoreDrizzleRealtimePayload<
  TRecord = any,
> {
  collection: string
  record: TRecord
  /**
   * Canonical record key when known. Built-in publishers populate this for
   * every update type so keyed subscriptions can match creates too.
   */
  key?: string
  type: RstoreDrizzleRealtimeUpdateType
  /**
   * Optional id of the client that triggered this update. When set, the
   * realtime handler will skip forwarding the update to the peer whose
   * `clientId` matches — this avoids sending an optimistic-update echo back
   * to the originator.
   */
  originClientId?: string
  /**
   * Per-field HLC timestamps for `created`/`updated` frames. Enables
   * field-level LWW merging on the client and lets late updates lose to
   * a tombstone.
   */
  fieldTimestamps?: FieldTimestamps
  /**
   * Causal timestamp (HLC) of a `deleted` event. Records a tombstone
   * client-side so concurrent in-flight updates cannot resurrect the row.
   */
  deletedAt?: FieldTimestampValue
}

export interface SubscriptionMessage {
  action: 'subscribe' | 'unsubscribe'
  collection: string
  key?: string | number
  where?: RstoreDrizzleCondition
}

/**
 * Server → client frame emitted when `realtime.authorize` rejects a
 * subscription. The client surfaces the rejection to the originating
 * subscription hook so consumers can show an error.
 */
export interface SubscriptionRejectedMessage {
  action: 'rejected'
  collection: string
  key?: string | number
  where?: RstoreDrizzleCondition
  reason?: string
}

/**
 * One-off init frame the client sends right after the socket opens so the
 * server can associate the peer with a stable client id (used for
 * skip-self echo suppression).
 */
export interface ClientInitMessage {
  clientId: string
  /** Optional protocol version — omitted for legacy v1 clients. */
  v?: number
}

/**
 * Server → client init acknowledgement frame. The client waits for this
 * before releasing queued mutations so its origin clientId is registered
 * before any echo can arrive.
 */
export interface InitAckMessage {
  ok: true
  /** Protocol version the server supports. */
  v: number
}

/**
 * Server → client init failure frame. Sent when the server cannot speak
 * the version the client announced — the server's `v` is included so the
 * client can downgrade or surface a clear error to the user. The server
 * closes the socket immediately after sending this frame.
 */
export interface InitErrorMessage {
  ok: false
  /** Stable error code. Today: `"unsupported-version"`. */
  error: string
  /** Highest protocol version the server understands. */
  v: number
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
