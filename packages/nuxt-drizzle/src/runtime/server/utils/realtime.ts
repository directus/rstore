import type { Table } from 'drizzle-orm'
import type { RstoreDrizzleRealtimePayload } from './hooks'
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
   * Optional id of the client that triggered this update. The realtime
   * handler will skip forwarding the update to the peer whose `clientId`
   * matches — avoids optimistic-update echo back to the originator.
   */
  originClientId?: string
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

  if (options.type !== 'created') {
    const providedKey = options.key == null ? undefined : normalizeKey(options.key)
    payload.key = providedKey ?? inferRecordKey(collection, options.record as Record<string, any>)
  }

  getPubSub().publish('update', payload)

  return payload
}
