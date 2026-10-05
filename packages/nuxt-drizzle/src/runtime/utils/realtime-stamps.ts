import type { FieldTimestampValue } from '@rstore/multiplayer/clock'
import type { SubscriptionUpdateMessage } from './realtime'
import { parseHLC } from '@rstore/multiplayer/clock'
import { maxStamp } from '@rstore/multiplayer/lww'

/**
 * Extract the latest HLC timestamp carried on an update payload. Returns
 * `undefined` for frames that predate the HLC protocol (v1).
 */
export function maxPayloadStamp(payload: SubscriptionUpdateMessage): FieldTimestampValue | undefined {
  if (payload.type === 'deleted') {
    return payload.deletedAt
  }
  return payload.fieldTimestamps ? maxStamp(payload.fieldTimestamps) ?? undefined : undefined
}

/** HLC string/number → wall-clock Date (physical component). */
export function stampToDate(stamp: FieldTimestampValue): Date {
  if (typeof stamp === 'number') {
    return new Date(stamp)
  }
  try {
    return new Date(parseHLC(stamp).physical)
  }
  catch {
    return new Date()
  }
}
