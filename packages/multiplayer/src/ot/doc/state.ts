import type { DocNodeRecord, DocState } from '../types.js'

/** Creates a document state from node records. */
export function createDocState(docId: string, nodes: Iterable<DocNodeRecord>, version: number): DocState {
  const map = new Map<string, DocNodeRecord>()
  for (const node of nodes) {
    map.set(node.id, node)
  }
  return { docId, version, nodes: map }
}

/** Shallow copy: records are immutable, so sharing them is safe. */
export function cloneDocState(state: DocState): DocState {
  return { docId: state.docId, version: state.version, nodes: new Map(state.nodes) }
}

/** Sibling order: `orderKey`, then `id` to break ties deterministically. */
export function compareSiblings(a: Pick<DocNodeRecord, 'orderKey' | 'id'>, b: Pick<DocNodeRecord, 'orderKey' | 'id'>): number {
  if (a.orderKey !== b.orderKey) {
    return a.orderKey < b.orderKey ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Options of `orderedChildren`. */
export interface OrderedChildrenOptions {
  /** Include soft-deleted children. @default false */
  includeDeleted?: boolean
}

/** Children of `parentId` (`null` for the roots) in sibling order. */
export function orderedChildren(state: DocState, parentId: string | null, options: OrderedChildrenOptions = {}): DocNodeRecord[] {
  const children: DocNodeRecord[] = []
  for (const node of state.nodes.values()) {
    if (node.parentId === parentId && (options.includeDeleted || !node.deleted)) {
      children.push(node)
    }
  }
  return children.sort(compareSiblings)
}

/** Whether a node and all its ancestors exist and are not deleted. */
export function isNodeVisible(state: DocState, id: string): boolean {
  let current = state.nodes.get(id)
  for (let depth = 0; current && depth < 10_000; depth++) {
    if (current.deleted) {
      return false
    }
    if (current.parentId === null) {
      return true
    }
    current = state.nodes.get(current.parentId)
  }
  return false
}

/** Ids of a node and its ancestors, nearest first. */
export function ancestorIds(state: DocState, id: string): string[] {
  const ids: string[] = []
  let current = state.nodes.get(id)
  while (current && ids.length < 10_000) {
    ids.push(current.id)
    current = current.parentId === null ? undefined : state.nodes.get(current.parentId)
  }
  return ids
}

/** Sets `version` on the given nodes (those present), as the sequencer stamped them. */
export function stampNodeVersions(state: DocState, ids: Iterable<string>, version: number): void {
  for (const id of ids) {
    const node = state.nodes.get(id)
    if (node && node.version !== version) {
      state.nodes.set(id, { ...node, version })
    }
  }
}
