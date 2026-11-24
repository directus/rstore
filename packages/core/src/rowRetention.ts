import type { ResolvedCollection, RetentionOptions } from '@rstore/shared'
import { resolveRetention, selectEvictions } from './retention.js'

/** Defaults within an opted-in row GC policy. */
export const unboundedRowRetention = Object.freeze({ ttlMs: Infinity, maxSize: Infinity })

/** A committed row's key and latest use. The object identifies this use when rechecking eviction. */
export interface RowUse {
  /** Public form of the canonical row key. */
  key: string | number
  /** Time of the most recent use in milliseconds. */
  at: number
}

/** Row GC bookkeeping shared by cache implementations. */
export type RowRetention = ReturnType<typeof createRowRetention>

/** Create state for row retention. Only collections with a finite bound track row uses. */
export function createRowRetention(options?: RetentionOptions) {
  const store = options === undefined ? undefined : resolveRetention(options, unboundedRowRetention, 'garbageCollection')
  const sharedLimit = store !== undefined && store.maxSize !== Infinity
  const rows = new Map<string, Map<string, RowUse>>()

  /** Whether this collection opts in to policy-based collection. */
  function managed(collection: ResolvedCollection): boolean {
    return store !== undefined || collection.garbageCollection !== undefined
  }

  /** Whether age or access order can affect this collection. */
  function tracks(collection: ResolvedCollection): boolean {
    const local = collection.garbageCollection
    return (local?.ttlMs ?? store?.ttlMs ?? Infinity) !== Infinity
      || (local?.maxSize ?? Infinity) !== Infinity
      || (store?.maxSize ?? Infinity) !== Infinity
  }

  return {
    managed,
    tracks,
    /** Whether targeted GC must include every configured collection. */
    sharedLimit,

    /** Record one accepted write, cache hit, or release of a row. Call only for committed rows. */
    touch(collection: ResolvedCollection, key: string | number, now?: number) {
      if (!tracks(collection))
        return
      let entries = rows.get(collection.name)
      if (!entries) {
        entries = new Map()
        rows.set(collection.name, entries)
      }
      const id = String(key)
      const at = now ?? Date.now()
      const previous = entries.get(id)
      if (previous?.at !== at)
        entries.set(id, { key: previous?.key ?? key, at })
    },

    /** Remove age bookkeeping when the committed row is deleted. */
    forget(collectionName: string, key: string | number) {
      const entries = rows.get(collectionName)
      entries?.delete(String(key))
      if (entries?.size === 0)
        rows.delete(collectionName)
    },

    /** Release bookkeeping for a full cache reset or disposal. */
    clear() {
      rows.clear()
    },

    /** Detect a deleted, replaced, or more recently used candidate before evicting it. */
    isCurrent(collection: ResolvedCollection, use: RowUse): boolean {
      return rows.get(collection.name)?.get(String(use.key)) === use
    },

    /** Select unused rows by TTL, collection capacity, then shared capacity. */
    select(collections: Iterable<ResolvedCollection>, isEligible: (collection: ResolvedCollection, key: string | number) => boolean, now = Date.now(), prefer?: (collection: ResolvedCollection, key: string | number) => boolean): Map<ResolvedCollection, RowUse[]> {
      const selected = new Map<ResolvedCollection, RowUse[]>()
      const survivors: Array<[RowUse, number]> = []
      const owners = new Map<RowUse, ResolvedCollection>()

      for (const collection of collections) {
        const entries = rows.get(collection.name)
        if (!entries?.size)
          continue
        const local = {
          ttlMs: collection.garbageCollection?.ttlMs ?? store?.ttlMs ?? Infinity,
          maxSize: collection.garbageCollection?.maxSize ?? Infinity,
        }
        const eligible: Array<[RowUse, number]> = []
        for (const use of entries.values()) {
          if (isEligible(collection, use.key))
            eligible.push([use, use.at])
        }
        const evicted = local.ttlMs === Infinity && eligible.length <= local.maxSize
          ? []
          : selectRows(eligible, local, now, prefer && (use => prefer(collection, use.key)))
        if (evicted.length)
          selected.set(collection, evicted)

        if (sharedLimit) {
          const excluded = new Set(evicted)
          for (const entry of eligible) {
            const [use] = entry
            if (!excluded.has(use)) {
              survivors.push(entry)
              owners.set(use, collection)
            }
          }
        }
      }

      if (store && survivors.length > store.maxSize) {
        const overflow = selectRows(survivors, { ttlMs: Infinity, maxSize: store.maxSize }, now, prefer && (use => prefer(owners.get(use)!, use.key)))
        for (const use of overflow) {
          const collection = owners.get(use)!
          const evicted = selected.get(collection)
          if (evicted)
            evicted.push(use)
          else
            selected.set(collection, [use])
        }
      }
      return selected
    },
  }
}

/** Expire by age, then evict unreferenced rows before warm snapshot rows. */
function selectRows(rows: Array<[RowUse, number]>, limits: { ttlMs: number, maxSize: number }, now: number, prefer?: (use: RowUse) => boolean): RowUse[] {
  if (!prefer)
    return selectEvictions(rows, limits, now)
  const cutoff = now - limits.ttlMs
  const expired = rows.filter(([, at]) => at <= cutoff).map(([row]) => row)
  const candidates = rows.filter(([, at]) => at > cutoff)
  const overflow = candidates.length - limits.maxSize
  if (overflow > 0) {
    candidates.sort(([a, aTime], [b, bTime]) => Number(prefer(a)) - Number(prefer(b)) || aTime - bTime)
    expired.push(...candidates.slice(0, overflow).map(([row]) => row))
  }
  return expired
}
