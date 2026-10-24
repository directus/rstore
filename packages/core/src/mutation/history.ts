import type { MutationOperation, RetentionOptions, StoreCore } from '@rstore/shared'
import type { ResolvedRetention } from '../retention'
import { resolveRetention } from '../retention'

/** `$mutationHistory` keeps the last 20 entries, for at most 10 minutes. */
export const defaultMutationHistoryRetention: ResolvedRetention = { ttlMs: 10 * 60_000, maxSize: 20 }

/** When each history entry was recorded, without adding a field to entries. */
const recordedAt = new WeakMap<MutationOperation<any, any, any>, number>()

/**
 * Validate `$mutationHistory` bounds, filling omitted limits from
 * {@link defaultMutationHistoryRetention}.
 *
 * @param options The `mutationHistory` store option or a runtime assignment;
 * `false` keeps every entry forever.
 * @returns Resolved limits, or `false` when nothing is evicted.
 * @throws {TypeError} When a limit cannot bound the history.
 */
export function resolveMutationHistoryRetention(options: false | RetentionOptions | undefined): false | ResolvedRetention {
  return resolveRetention(options, defaultMutationHistoryRetention, 'mutationHistory')
}

/**
 * Count the leading history entries recorded `ttlMs` or longer ago.
 *
 * Entries are in insertion order, so the walk stops at the first known recent
 * entry: an older timestamp behind it (the clock went backwards) does not let
 * it evict a recent entry. Entries pushed onto `$mutationHistory` directly
 * have no recording time; one expires only along with a later expired entry,
 * since it was pushed before that entry was recorded.
 *
 * @param history Entries, oldest first.
 * @param ttlMs Retention TTL.
 * @param now Current time (ms).
 * @returns Number of entries to drop from the start.
 */
function countExpired(history: Array<MutationOperation<any, any, any>>, ttlMs: number, now: number): number {
  if (ttlMs === Infinity) {
    return 0
  }
  const cutoff = now - ttlMs
  let expired = 0
  for (let index = 0; index < history.length; index++) {
    const at = recordedAt.get(history[index]!)
    if (at === undefined) {
      continue
    }
    if (at > cutoff) {
      break
    }
    expired = index + 1
  }
  return expired
}

/**
 * Append a mutation to `store.$mutationHistory`, then evict entries older than
 * the retention TTL and the oldest beyond its size.
 *
 * Each entry holds its payload (items or module mutation arguments), so an
 * unbounded history retains every mutated payload for the store's lifetime;
 * that only happens when retention is `false`. Evicting on append keeps
 * `$mutationHistory` a plain oldest-first array.
 *
 * @param store Store owning the history.
 * @param entry Mutation to record.
 */
export function recordMutationHistory(store: StoreCore<any, any>, entry: MutationOperation<any, any, any>): void {
  const history = store.$mutationHistory
  const retention = store.$mutationHistoryRetention
  if (retention && retention.maxSize === 0) {
    // Nothing kept: also drop what an earlier retention kept.
    history.length = 0
    return
  }
  const now = Date.now()
  recordedAt.set(entry, now)
  history.push(entry)
  if (!retention) {
    return
  }
  // Evicted entries are a prefix: the expired ones, then the overflow.
  const evicted = Math.max(countExpired(history, retention.ttlMs, now), history.length - retention.maxSize)
  if (evicted > 0) {
    history.splice(0, evicted)
  }
}
