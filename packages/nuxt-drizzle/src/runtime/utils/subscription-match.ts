import type { SubscriptionMessage } from './realtime'
import { filterWhere } from '../where'

/**
 * Dialect identifier consumed by `filterWhere` (used for case-insensitive
 * `like` / `ilike` semantics). Mirrors the server-side `Dialect` type
 * without pulling in h3 / Drizzle imports.
 */
export type RstoreDrizzleDialect = 'postgresql' | 'mysql' | 'singlestore' | 'sqlite' | 'gel' | 'turso'

/**
 * Returns `true` when the given realtime update should be delivered to a
 * peer that holds the given subscription. All three conditions must hold:
 *
 * - the collection names match,
 * - the subscription is either wildcard-keyed or its key equals the
 *   update's key (keys should be compared as strings — see
 *   `normalizeSubscriptionKey`),
 * - the subscription has no `where` filter, or the `where` filter accepts
 *   the update (see below).
 *
 * `where` matching depends on the frame type:
 *
 * - `created` and `deleted` frames match on `record` alone (`deleted`
 *   frames carry the pre-delete row, so that IS the record the subscriber
 *   may hold).
 * - `updated` frames match when the new **or** the previous record
 *   satisfies the filter — a subscriber whose filter matched the pre-update
 *   record holds it in cache and must be told it left the filter. When no
 *   `previousRecord` is available (custom publishes), the frame is
 *   delivered unconditionally and the client-side filter decides.
 */
export function subscriptionMatches(
  subscription: SubscriptionMessage,
  update: { collection: string, key?: string, record: any, type?: 'created' | 'updated' | 'deleted', previousRecord?: any },
  dialect: RstoreDrizzleDialect,
): boolean {
  if (subscription.collection !== update.collection) {
    return false
  }
  if (subscription.key != null && subscription.key !== update.key) {
    return false
  }
  if (subscription.where) {
    if (update.type === 'updated') {
      if (update.previousRecord === undefined) {
        return true
      }
      return filterWhere(update.record, subscription.where, dialect)
        || filterWhere(update.previousRecord, subscription.where, dialect)
    }
    return filterWhere(update.record, subscription.where, dialect)
  }
  return true
}
