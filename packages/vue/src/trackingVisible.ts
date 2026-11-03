import type { Collection, CollectionDefaults, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import { createTrackingObject } from './trackingRelations'

/** Wrapped cache item exposed by a query result. */
export type TrackedItem = WrappedItemBase<Collection, CollectionDefaults, StoreSchema>

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

/** Reference-counted wrapper set shared by flat and relation-graph membership. */
export interface MemberCounts {
  /** Identities held by at least one member, updated in place. */
  readonly tracking: HookMetaQueryTracking
  /** Current members with their identity and reference count. */
  readonly members: ReadonlyMap<TrackedItem, { collection: string, key: string | number, refs: number }>
  /** Add one reference to a wrapper, recording it in `added` when it is new. */
  add: (item: TrackedItem, collection: string, key: string | number, added: TrackedItem[]) => void
  /** Drop one reference, recording its identity in `removed` once no wrapper holds it. */
  remove: (item: TrackedItem, removed: HookMetaQueryTracking) => void
  /** Forget every member. */
  reset: () => void
}

/** Create an empty membership change. */
export function createMembershipChange(): VisibleMembershipChange {
  return { added: [], removed: createTrackingObject() }
}

/**
 * Count wrappers by identity. A layer swap replaces one wrapper of a key by
 * another, and relation graphs reach one wrapper from several roots, so an
 * identity is released only when its last reference leaves.
 */
export function createMemberCounts(): MemberCounts {
  let tracking = createTrackingObject()
  let members = new Map<TrackedItem, { collection: string, key: string | number, refs: number }>()
  // Wrappers per identity, independent of how many references each holds.
  let counts = new Map<string, Map<string | number, number>>()

  return {
    get tracking() {
      return tracking
    },
    get members() {
      return members
    },

    add(item, collection, key, added) {
      const member = members.get(item)
      if (member) {
        member.refs++
        return
      }
      members.set(item, { collection, key, refs: 1 })
      let keys = counts.get(collection)
      if (!keys) {
        keys = new Map()
        counts.set(collection, keys)
      }
      keys.set(key, (keys.get(key) ?? 0) + 1)
      ;(tracking.items[collection] ??= new Set()).add(key)
      added.push(item)
    },

    remove(item, removed) {
      const member = members.get(item)
      if (!member || --member.refs > 0)
        return
      members.delete(item)
      const { collection, key } = member
      const keys = counts.get(collection)!
      const count = keys.get(key)! - 1
      if (count > 0) {
        keys.set(key, count)
        return
      }
      keys.delete(key)
      tracking.items[collection]?.delete(key)
      ;(removed.items[collection] ??= new Set()).add(key)
    },

    reset() {
      tracking = createTrackingObject()
      members = new Map()
      counts = new Map()
    },
  }
}

/** Collect the distinct wrappers of a list or single-item result. */
export function collectResultItems(result: unknown): Set<TrackedItem> {
  const items = new Set<TrackedItem>()
  for (const item of Array.isArray(result) ? result : [result]) {
    if (item && typeof item === 'object')
      items.add(item as TrackedItem)
  }
  return items
}

/**
 * Track which wrappers a cache-backed result shows without rereading rows that
 * stayed visible. Whole-table synced readers republish their result on every
 * cache write, so a full traversal per write froze large apps.
 */
export function createVisibleMembership(): VisibleMembership {
  const counts = createMemberCounts()

  return {
    get tracking() {
      return counts.tracking
    },

    update(result) {
      const next = collectResultItems(result)
      const change = createMembershipChange()
      let visibleMembers = 0
      for (const item of next) {
        if (!counts.members.has(item)) {
          // Identity is read once, when the wrapper enters the result.
          const collection = item.$collection
          if (!collection)
            continue
          counts.add(item, collection, item.$getKey(), change.added)
        }
        visibleMembers++
      }
      // Every member is still visible: skip the departure scan entirely.
      if (counts.members.size === visibleMembers)
        return change
      for (const item of Array.from(counts.members.keys())) {
        if (!next.has(item))
          counts.remove(item, change.removed)
      }
      return change
    },

    reset() {
      counts.reset()
    },
  }
}
