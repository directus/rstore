import type { Collection, CollectionDefaults, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import { createTrackingObject } from './trackingRelations'

/** Wrapped cache item exposed by a query result. */
type TrackedItem = WrappedItemBase<Collection, CollectionDefaults, StoreSchema>

/** Membership change produced by one visible result. */
export interface VisibleMembershipChange {
  /** Wrappers that entered the result and must gain the query's ownership. */
  added: TrackedItem[]
  /** Identities no visible wrapper holds anymore. */
  removed: HookMetaQueryTracking
}

/** Incremental identity set of a non-collecting query's live cache result. */
export interface VisibleMembership {
  /** Identities of the current result, updated in place by {@link VisibleMembership.update}. */
  readonly tracking: HookMetaQueryTracking
  /** Diff the next visible result against the current members. */
  update: (result: unknown) => VisibleMembershipChange
  /** Forget every member after its ownership was released elsewhere. */
  reset: () => void
}

/**
 * Track which wrappers a cache-backed result shows without rereading rows that
 * stayed visible. Whole-table synced readers republish their result on every
 * cache write, so a full traversal per write froze large apps.
 */
export function createVisibleMembership(): VisibleMembership {
  let tracking = createTrackingObject()
  // Identity of each visible wrapper, read once when it enters the result.
  let members = new Map<TrackedItem, { collection: string, key: string | number }>()
  // Wrappers per identity: a layer swap replaces one wrapper of a key by another.
  let counts = new Map<string, Map<string | number, number>>()

  return {
    get tracking() {
      return tracking
    },

    update(result) {
      const next = new Set<TrackedItem>()
      for (const item of Array.isArray(result) ? result : [result]) {
        if (item && typeof item === 'object')
          next.add(item as TrackedItem)
      }

      const added: TrackedItem[] = []
      let visibleMembers = 0
      for (const item of next) {
        if (members.has(item)) {
          visibleMembers++
          continue
        }
        const collection = item.$collection
        if (!collection)
          continue
        const key = item.$getKey()
        members.set(item, { collection, key })
        let keys = counts.get(collection)
        if (!keys) {
          keys = new Map()
          counts.set(collection, keys)
        }
        keys.set(key, (keys.get(key) ?? 0) + 1)
        ;(tracking.items[collection] ??= new Set()).add(key)
        added.push(item)
        visibleMembers++
      }

      const removed = createTrackingObject()
      // Every member is still visible: skip the departure scan entirely.
      if (members.size === visibleMembers)
        return { added, removed }
      for (const [item, { collection, key }] of members) {
        if (next.has(item))
          continue
        members.delete(item)
        const keys = counts.get(collection)!
        const count = keys.get(key)! - 1
        if (count > 0) {
          keys.set(key, count)
          continue
        }
        keys.delete(key)
        tracking.items[collection]?.delete(key)
        ;(removed.items[collection] ??= new Set()).add(key)
      }
      return { added, removed }
    },

    reset() {
      tracking = createTrackingObject()
      members = new Map()
      counts = new Map()
    },
  }
}
