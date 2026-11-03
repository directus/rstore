import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, StoreSchema } from '@rstore/shared'
import type { EffectScope } from 'vue'
import type { VueStore } from './store'
import type { TrackedItem, VisibleMembershipChange } from './trackingVisible'
import { effectScope } from 'vue'
import { watchQueryTracking } from './trackingEffect'
import { findTrackedCollection, resolveNestedInclude } from './trackingRelations'
import { collectResultItems, createMemberCounts, createMembershipChange } from './trackingVisible'

/** Relation selection traversed from one wrapper. */
type GraphInclude = FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> | undefined

/** One wrapper reached with one include selection. */
interface GraphNode {
  item: TrackedItem
  include: GraphInclude
  /** Parent edges plus visible-root references keeping this node alive. */
  refs: number
  /** Child nodes last read from this wrapper's selected relations. */
  children: Set<GraphNode>
  /** Owns the relation effect and the exact cache signals it retains; leaves have none. */
  scope?: EffectScope
}

/** Options of {@link createVisibleGraphMembership}. */
export interface VisibleGraphMembershipOptions {
  /** Query whose released rows a traversal must not adopt again. */
  dirtyQueryId?: () => string | undefined
}

/** Incremental relation-graph membership of one query page. */
export interface VisibleGraphMembership {
  /** Identities of every reachable wrapper, updated in place. */
  readonly tracking: HookMetaQueryTracking
  /** Whether the current roots were traversed with this include selection. */
  matches: (include: GraphInclude) => boolean
  /** Diff the roots, traversing only nodes that entered the graph. */
  update: (result: unknown, include: GraphInclude) => VisibleMembershipChange
  /** Stop every node effect and forget all members. */
  reset: () => void
}

/**
 * Track the relation graph of a query's roots incrementally.
 *
 * Each (wrapper, include) pair is one shared node whose batched effect reads
 * only that wrapper's selected relations. A cache write reruns the nodes that
 * read it instead of re-walking every root, and graphs converging on one row
 * share its node. Changes found by node effects are reported through
 * `onChange`, once per cache publication and before any synchronous sweep.
 */
export function createVisibleGraphMembership(
  store: VueStore,
  onChange: (change: VisibleMembershipChange) => void,
  options: VisibleGraphMembershipOptions = {},
): VisibleGraphMembership {
  const counts = createMemberCounts()
  let nodes = new Map<TrackedItem, Map<GraphInclude, GraphNode>>()
  let roots = new Map<TrackedItem, GraphNode>()
  let signature: string | undefined

  /** Whether a wrapper may join the graph as a node. */
  function isTrackable(item: TrackedItem): boolean {
    const dirtyQueryId = options.dirtyQueryId?.()
    return !!item.$collection && !(dirtyQueryId && item.$meta.dirtyQueries.has(dirtyQueryId))
  }

  /** Read one wrapper's selected relation targets with their nested selections. */
  function readChildren(item: TrackedItem, include: GraphInclude): Array<[TrackedItem, GraphInclude]> | undefined {
    const collection = findTrackedCollection(store, item.$collection)
    if (!collection || !include)
      return []
    try {
      const children: Array<[TrackedItem, GraphInclude]> = []
      for (const relationName in collection.relations) {
        const relationInclude = include[relationName]
        if (!relationInclude)
          continue
        const value = item[relationName as keyof typeof item] as unknown as TrackedItem | TrackedItem[] | undefined
        for (const related of Array.isArray(value) ? value : [value]) {
          if (!related || !isTrackable(related))
            continue
          const relatedCollection = findTrackedCollection(store, related.$collection)
          children.push([related, relatedCollection ? resolveNestedInclude(relatedCollection.relations, relationInclude) : undefined])
        }
      }
      return children
    }
    catch {
      // A component can invalidate rows immediately before unmount: keep the
      // last children until the node leaves or the query is released.
      return undefined
    }
  }

  /** Whether an include selects at least one relation of the wrapper's collection. */
  function selectsRelations(item: TrackedItem, include: GraphInclude): boolean {
    if (!include)
      return false
    const relations = findTrackedCollection(store, item.$collection)?.relations
    for (const name in relations) {
      if (include[name])
        return true
    }
    return false
  }

  /** Add one reference to a node, creating and traversing it when new. */
  function acquire(item: TrackedItem, include: GraphInclude, change: VisibleMembershipChange): GraphNode | undefined {
    let byInclude = nodes.get(item)
    const existing = byInclude?.get(include)
    if (existing) {
      existing.refs++
      return existing
    }
    const collection = item.$collection
    if (!collection)
      return undefined
    const node: GraphNode = { item, include, refs: 1, children: new Set() }
    if (!byInclude) {
      byInclude = new Map()
      nodes.set(item, byInclude)
    }
    byInclude.set(include, node)
    counts.add(item, collection, item.$getKey(), change.added)
    if (!selectsRelations(item, include))
      return node
    // Batched reruns happen outside any component scope. Without an owner,
    // cache reads fall back to collection-wide versions and every node would
    // rerun on any write to a related collection.
    const scope = node.scope = effectScope(true)
    let initial = true
    scope.run(() => watchQueryTracking(store, () => scope.run(() => readChildren(item, include)), (next) => {
      if (!next || !nodes.get(item)?.has(include))
        return
      if (initial) {
        reconcileChildren(node, next, change)
        return
      }
      const nodeChange = createMembershipChange()
      reconcileChildren(node, next, nodeChange)
      if (nodeChange.added.length || Object.keys(nodeChange.removed.items).length)
        onChange(nodeChange)
    }, { immediate: true }))
    initial = false
    return node
  }

  /** Drop one reference to a node, releasing its subgraph when unreferenced. */
  function release(node: GraphNode, change: VisibleMembershipChange): void {
    if (--node.refs > 0)
      return
    node.scope?.stop()
    const byInclude = nodes.get(node.item)!
    byInclude.delete(node.include)
    if (!byInclude.size)
      nodes.delete(node.item)
    counts.remove(node.item, change.removed)
    for (const child of node.children) release(child, change)
  }

  /** Replace a node's child edges: acquire new children before releasing old ones. */
  function reconcileChildren(node: GraphNode, next: Array<[TrackedItem, GraphInclude]>, change: VisibleMembershipChange): void {
    const previous = node.children
    const children = new Set<GraphNode>()
    for (const [item, include] of next) {
      const existing = nodes.get(item)?.get(include)
      if (existing && previous.has(existing)) {
        children.add(existing)
        continue
      }
      // A relation can list one row twice; one edge per distinct child.
      if (existing && children.has(existing))
        continue
      const child = acquire(item, include, change)
      if (child)
        children.add(child)
    }
    node.children = children
    for (const child of previous) {
      if (!children.has(child))
        release(child, change)
    }
  }

  return {
    get tracking() {
      return counts.tracking
    },

    matches(include) {
      return signature === JSON.stringify(include)
    },

    update(result, include) {
      const change = createMembershipChange()
      const nextSignature = JSON.stringify(include)
      // A different selection reaches different relations from every root.
      if (nextSignature !== signature) {
        for (const node of roots.values()) release(node, change)
        roots = new Map()
        signature = nextSignature
      }
      const next = collectResultItems(result)
      let visibleRoots = 0
      for (const root of next) {
        if (!roots.has(root) && isTrackable(root)) {
          const node = acquire(root, include, change)
          if (node)
            roots.set(root, node)
        }
        if (roots.has(root))
          visibleRoots++
      }
      if (roots.size !== visibleRoots) {
        for (const [root, node] of Array.from(roots)) {
          if (!next.has(root)) {
            roots.delete(root)
            release(node, change)
          }
        }
      }
      return change
    },

    reset() {
      for (const byInclude of nodes.values()) {
        for (const node of byInclude.values()) node.scope?.stop()
      }
      nodes = new Map()
      roots = new Map()
      counts.reset()
      signature = undefined
    },
  }
}
