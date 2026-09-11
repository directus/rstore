import type { CacheTombstone, CacheTombstones, FieldTimestampValue } from '@rstore/shared'
import { compareHLC, stringifyHLC } from './hlc/index.js'

/** Compute the storage key used internally to index tombstones. */
export function tombstoneKey(collection: string, key: string | number): string {
  return JSON.stringify([collection, String(key)])
}

/**
 * Decide whether an incoming update should resurrect a previously-deleted key.
 *
 * The update wins when its highest field timestamp is strictly greater than
 * the tombstone's `deletedAt`. Passing a single timestamp (HLC string or
 * number) is equivalent to passing `{ field: ts }` with one field.
 */
export function shouldResurrect(
  tombstone: CacheTombstone,
  updateTimestamp: FieldTimestampValue | Record<string, FieldTimestampValue>,
): boolean {
  const updateMax = maxTimestamp(updateTimestamp)
  if (updateMax == null) {
    return false
  }
  return compareHLC(updateMax, tombstone.deletedAt) > 0
}

function maxTimestamp(
  value: FieldTimestampValue | Record<string, FieldTimestampValue>,
): FieldTimestampValue | null {
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }
  let best: FieldTimestampValue | null = null
  for (const ts of Object.values(value)) {
    if (best == null || compareHLC(ts, best) > 0) {
      best = ts
    }
  }
  return best
}

/** Mutable Core tombstone index extending Shared's read-only cache contract. */
export interface TombstoneStore extends CacheTombstones {
  set: (tombstone: CacheTombstone) => void
  clear: (collection: string, key: string | number) => void
}

/**
 * Create an in-memory tombstone store. `set` is safe to call with an earlier
 * tombstone — the existing (later) tombstone is kept, since the delete order
 * is the max of all observed delete timestamps.
 */
export function createTombstoneStore(): TombstoneStore {
  const collections = new Map<string, Map<string, CacheTombstone>>()
  let count = 0
  return {
    get(collection, key) {
      return collections.get(collection)?.get(String(key))
    },
    set(tombstone) {
      const id = String(tombstone.key)
      let entries = collections.get(tombstone.collection)
      const existing = entries?.get(id)
      if (existing && compareHLC(existing.deletedAt, tombstone.deletedAt) >= 0) {
        return
      }
      if (!entries) {
        entries = new Map()
        collections.set(tombstone.collection, entries)
      }
      if (!existing) {
        count++
      }
      entries.set(id, tombstone)
    },
    clear(collection, key) {
      const entries = collections.get(collection)
      if (!entries?.delete(String(key))) {
        return
      }
      count--
      if (entries.size === 0) {
        collections.delete(collection)
      }
    },
    * entries() {
      for (const [collection, entries] of collections) {
        for (const tombstone of entries.values()) {
          yield [tombstoneKey(collection, tombstone.key), tombstone]
        }
      }
    },
    size() {
      return count
    },
  }
}

/**
 * Garbage-collect tombstones whose `deletedAt` is older than `olderThan`.
 * Returns the list of removed tombstone identifiers.
 */
export function gcTombstones(
  store: TombstoneStore,
  olderThan: FieldTimestampValue,
): Array<{ collection: string, key: string | number }> {
  const dropped: Array<{ collection: string, key: string | number }> = []
  for (const [, tomb] of store.entries()) {
    if (compareHLC(tomb.deletedAt, olderThan) < 0) {
      store.clear(tomb.collection, tomb.key)
      dropped.push({ collection: tomb.collection, key: tomb.key })
    }
  }
  return dropped
}

/**
 * Diagnostic payload for {@link ScheduleTombstoneGcOptions.onSweep}. Fired
 * after every GC tick — the count is zero on quiet ticks so monitoring
 * code can confirm the timer is alive.
 */
export interface TombstoneGcSweepInfo {
  /** Number of tombstones removed on this tick. */
  droppedCount: number
  /** Wall-clock cutoff (ms) used as the GC threshold. */
  cutoffMs: number
}

/** Options for {@link scheduleTombstoneGc}. */
export interface ScheduleTombstoneGcOptions {
  /** Sweep interval in milliseconds. Must be > 0. */
  intervalMs: number
  /**
   * Tombstones older than this many milliseconds (relative to
   * `now()`) are dropped. Pick a value comfortably larger than the
   * worst-case time a peer might be offline — once a tombstone is GC'd,
   * a late-arriving update for the same key may resurrect the row.
   */
  ttlMs: number
  /** Inject a clock — defaults to `Date.now`. Useful in tests. */
  now?: () => number
  /** Called after every sweep, even when nothing was dropped. */
  onSweep?: (info: TombstoneGcSweepInfo) => void
}

/**
 * Periodically drops tombstones older than the configured TTL. Returns a
 * cleanup function that stops the timer; call it on application shutdown
 * or when the surrounding store is torn down. Without this, tombstones
 * accumulate forever in long-lived clients with many deletes.
 */
export function scheduleTombstoneGc(
  store: TombstoneStore,
  options: ScheduleTombstoneGcOptions,
): () => void {
  if (!(options.intervalMs > 0)) {
    throw new Error(`scheduleTombstoneGc: intervalMs must be > 0 (received ${options.intervalMs})`)
  }
  const now = options.now ?? (() => Date.now())

  const sweep = () => {
    const cutoffMs = now() - options.ttlMs
    // Encode the cutoff into an HLC string with logical 0 and an empty
    // nodeId so it sorts strictly before any real HLC at the same physical
    // time — keeps the boundary conservative.
    const cutoff = stringifyHLC({ physical: cutoffMs, logical: 0, nodeId: '' })
    const dropped = gcTombstones(store, cutoff)
    options.onSweep?.({ droppedCount: dropped.length, cutoffMs })
  }

  const handle = setInterval(sweep, options.intervalMs)
  // Don't keep a Node process alive solely for tombstone GC.
  if (typeof (handle as { unref?: () => unknown }).unref === 'function') {
    (handle as { unref: () => void }).unref()
  }

  return () => clearInterval(handle)
}
