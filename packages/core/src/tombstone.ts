import type { FieldTimestampValue } from './hlc/index.js'
import { compareHLC, stringifyHLC } from './hlc/index.js'

/**
 * A tombstone records a deletion with its causal timestamp so that concurrent
 * writes arriving after the delete can be suppressed (or applied, if they
 * are newer than the delete).
 */
export interface Tombstone {
  collection: string
  key: string | number
  /** Serialized HLC — or legacy numeric wall-clock — of the delete. */
  deletedAt: FieldTimestampValue
}

/** Compute the storage key used internally to index tombstones. */
export function tombstoneKey(collection: string, key: string | number): string {
  return `${collection}:${key}`
}

/** Narrowing guard for arbitrary values that look like a {@link Tombstone}. */
export function isTombstone(value: unknown): value is Tombstone {
  if (!value || typeof value !== 'object') {
    return false
  }
  const t = value as Partial<Tombstone>
  return typeof t.collection === 'string'
    && (typeof t.key === 'string' || typeof t.key === 'number')
    && (typeof t.deletedAt === 'string' || typeof t.deletedAt === 'number')
}

/**
 * Decide whether an incoming update should resurrect a previously-deleted key.
 *
 * The update wins when its highest field timestamp is strictly greater than
 * the tombstone's `deletedAt`. Passing a single timestamp (HLC string or
 * number) is equivalent to passing `{ field: ts }` with one field.
 */
export function shouldResurrect(
  tombstone: Tombstone,
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

/** In-memory tombstone index. */
export interface TombstoneStore {
  get: (collection: string, key: string | number) => Tombstone | undefined
  set: (tombstone: Tombstone) => void
  clear: (collection: string, key: string | number) => void
  entries: () => IterableIterator<[string, Tombstone]>
  size: () => number
}

/**
 * Create an in-memory tombstone store. `set` is safe to call with an earlier
 * tombstone — the existing (later) tombstone is kept, since the delete order
 * is the max of all observed delete timestamps.
 */
export function createTombstoneStore(): TombstoneStore {
  const map = new Map<string, Tombstone>()
  return {
    get(collection, key) {
      return map.get(tombstoneKey(collection, key))
    },
    set(tombstone) {
      const id = tombstoneKey(tombstone.collection, tombstone.key)
      const existing = map.get(id)
      if (existing && compareHLC(existing.deletedAt, tombstone.deletedAt) >= 0) {
        return
      }
      map.set(id, tombstone)
    },
    clear(collection, key) {
      map.delete(tombstoneKey(collection, key))
    },
    entries() {
      return map.entries()
    },
    size() {
      return map.size
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
