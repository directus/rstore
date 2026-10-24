import type { RetentionOptions } from '@rstore/shared'

/** Retention limits with every value resolved; `Infinity` means unbounded. */
export interface ResolvedRetention {
  /** Milliseconds after its last use when an entry expires. */
  ttlMs: number
  /** Maximum number of evictable entries kept. */
  maxSize: number
}

/**
 * Resolve user retention options over a structure's defaults.
 *
 * @param options User options; `false` keeps every entry forever.
 * @param defaults Limits used for omitted options.
 * @param label Prefix of validation errors, naming the option being resolved.
 * @returns Resolved limits, or `false` when nothing may be evicted.
 * @throws {TypeError} When a limit is not a positive TTL or a size >= 0.
 */
export function resolveRetention(options: RetentionOptions | undefined, defaults: ResolvedRetention, label?: string): ResolvedRetention
export function resolveRetention(options: false | RetentionOptions | undefined, defaults: ResolvedRetention, label?: string): ResolvedRetention | false
export function resolveRetention(options: false | RetentionOptions | undefined, defaults: ResolvedRetention, label = 'retention'): ResolvedRetention | false {
  if (options === false) {
    return false
  }
  const ttlMs = options?.ttlMs ?? defaults.ttlMs
  const maxSize = options?.maxSize ?? defaults.maxSize
  if (!(ttlMs > 0)) {
    throw new TypeError(`${label}: ttlMs must be > 0 (received ${ttlMs})`)
  }
  if (!(maxSize >= 0) || (maxSize !== Infinity && !Number.isInteger(maxSize))) {
    throw new TypeError(`${label}: maxSize must be an integer >= 0 (received ${maxSize})`)
  }
  return { ttlMs, maxSize }
}

/**
 * Pick the entries to evict: every entry last used `ttlMs` or longer ago,
 * then the least recently used ones beyond `maxSize`.
 *
 * Callers pass only evictable entries; entries still in use (a mounted query,
 * for instance) must be left out so they neither expire nor count.
 *
 * @param usedAt Last-use time (ms) of each evictable entry.
 * @param retention Resolved limits.
 * @param now Current time (ms).
 * @returns Keys to evict, oldest first.
 */
export function selectEvictions<K>(usedAt: Iterable<[K, number]>, retention: ResolvedRetention, now: number): K[] {
  const byAge = Array.from(usedAt).sort((a, b) => a[1] - b[1])
  const cutoff = now - retention.ttlMs
  // Entries expire up to the first recent one; then trim the oldest survivors.
  let evicted = 0
  while (evicted < byAge.length && byAge[evicted]![1] <= cutoff) {
    evicted++
  }
  evicted = Math.max(evicted, byAge.length - retention.maxSize)
  return byAge.slice(0, evicted).map(([key]) => key)
}
