import type { FieldTimestamps, FieldTimestampValue } from '@rstore/shared'
import type { Table } from 'drizzle-orm'
import type { RstoreDrizzleRealtimePayload } from './hooks'
import { getDefaultClock, stringifyHLC } from '@rstore/core'
import { getDrizzleCollectionNameFromTable, getDrizzleTableFromCollection } from './index'
import { getPubSub } from './pubsub'

export type RstoreDrizzleRealtimeUpdateType = 'created' | 'updated' | 'deleted'

type CollectionInput = string | Table
type RealtimeKeyInput = string | number | Array<string | number>

export interface PublishRstoreDrizzleRealtimeCreatedUpdateOptions<TRecord = any> {
  collection: CollectionInput
  type: 'created'
  record: TRecord
  /**
   * Primary key value (or composite key array). If omitted, key is inferred from `record` and table primary keys.
   */
  key?: RealtimeKeyInput
  /**
   * Optional id of the client that triggered this update. The realtime
   * handler will skip forwarding the update to the peer whose `clientId`
   * matches — avoids optimistic-update echo back to the originator.
   */
  originClientId?: string
  /**
   * Optional explicit per-field timestamps. When omitted, a fresh HLC is
   * generated server-side and applied to every field of the record.
   */
  fieldTimestamps?: FieldTimestamps
}

export interface PublishRstoreDrizzleRealtimeChangedUpdateOptions<
  TRecord = any,
  TType extends 'updated' | 'deleted' = 'updated' | 'deleted',
> {
  collection: CollectionInput
  type: TType
  record: TRecord
  /**
   * Primary key value (or composite key array). If omitted, key is inferred from `record` and table primary keys.
   */
  key?: RealtimeKeyInput
  /**
   * @see PublishRstoreDrizzleRealtimeCreatedUpdateOptions.originClientId
   */
  originClientId?: string
  /**
   * Per-field HLC timestamps for `updated` frames. Ignored for `deleted`.
   */
  fieldTimestamps?: FieldTimestamps
  /**
   * Explicit tombstone timestamp for `deleted` frames. Falls back to a
   * fresh server HLC when omitted.
   */
  deletedAt?: FieldTimestampValue
}

export type PublishRstoreDrizzleRealtimeUpdateOptions<TRecord = any>
  = | PublishRstoreDrizzleRealtimeCreatedUpdateOptions<TRecord>
    | PublishRstoreDrizzleRealtimeChangedUpdateOptions<TRecord>

function normalizeKey(key: RealtimeKeyInput): string {
  if (Array.isArray(key)) {
    return key.map(part => String(part)).join('::')
  }
  return String(key)
}

function inferRecordKey(collection: string, record: Record<string, any>): string {
  const { primaryKeys } = getDrizzleTableFromCollection(collection)
  if (!primaryKeys.length) {
    throw new Error(`Cannot infer realtime key for collection "${collection}" because no primary key is configured.`)
  }

  return primaryKeys.map((primaryKey) => {
    const value = record[primaryKey]
    if (value == null) {
      throw new Error(`Cannot infer realtime key for collection "${collection}": missing "${primaryKey}" on record.`)
    }
    return String(value)
  }).join('::')
}

/**
 * Build a `FieldTimestamps` object where every own field of `record` is
 * stamped with the same HLC. Used when the caller did not supply an
 * explicit per-field timestamp map.
 */
function buildUniformFieldTimestamps(record: Record<string, any>, stamp: FieldTimestampValue): FieldTimestamps {
  const out: FieldTimestamps = {}
  for (const key of Object.keys(record)) {
    out[key] = stamp
  }
  return out
}

export function publishRstoreDrizzleRealtimeUpdate<TRecord = any>(
  options: PublishRstoreDrizzleRealtimeUpdateOptions<TRecord>,
): RstoreDrizzleRealtimePayload<TRecord> {
  const collection = typeof options.collection === 'string'
    ? options.collection
    : getDrizzleCollectionNameFromTable(options.collection)

  const payload = {
    collection,
    type: options.type,
    record: options.record,
    key: undefined,
    originClientId: options.originClientId,
  } as RstoreDrizzleRealtimePayload<TRecord>

  const providedKey = options.key == null ? undefined : normalizeKey(options.key)
  payload.key = providedKey ?? inferRecordKey(collection, options.record as Record<string, any>)

  // Stamp a fresh HLC on every publish so clients can CRDT-merge and
  // tombstones order correctly. Callers can override via options.
  const stamp = stringifyHLC(getDefaultClock().now())
  if (options.type === 'deleted') {
    payload.deletedAt = (options as PublishRstoreDrizzleRealtimeChangedUpdateOptions<TRecord, 'deleted'>).deletedAt ?? stamp
  }
  else {
    const record = options.record as Record<string, any>
    payload.fieldTimestamps = options.fieldTimestamps
      ?? (record && typeof record === 'object' ? buildUniformFieldTimestamps(record, stamp) : undefined)
  }

  getPubSub().publish('update', payload)

  return payload
}
