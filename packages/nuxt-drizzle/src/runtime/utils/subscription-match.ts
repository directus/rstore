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
 *   the update's record.
 */
export function subscriptionMatches(
  subscription: SubscriptionMessage,
  update: { collection: string, key?: string, record: any },
  dialect: RstoreDrizzleDialect,
): boolean {
  if (subscription.collection !== update.collection) {
    return false
  }
  if (subscription.key != null && subscription.key !== update.key) {
    return false
  }
  if (subscription.where && !filterWhere(update.record, subscription.where, dialect)) {
    return false
  }
  return true
}
