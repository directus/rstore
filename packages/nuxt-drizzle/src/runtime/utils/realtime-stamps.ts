import type { FieldTimestampValue } from '@rstore/shared'
import type { SubscriptionUpdateMessage } from './realtime'
import { compareHLC, parseHLC } from '@rstore/core'

/**
 * Extract the latest HLC timestamp carried on an update payload. Returns
 * `undefined` for frames that predate the HLC protocol (v1).
 */
export function maxPayloadStamp(payload: SubscriptionUpdateMessage): FieldTimestampValue | undefined {
  if (payload.type === 'deleted') {
    return payload.deletedAt
  }
  const ts = payload.fieldTimestamps
  if (!ts) {
    return undefined
  }
  let best: FieldTimestampValue | undefined
  for (const v of Object.values(ts)) {
    if (best === undefined || compareHLC(v, best) > 0) {
      best = v
    }
  }
  return best
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
