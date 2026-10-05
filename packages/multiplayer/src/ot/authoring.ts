import type { DocNodeRecord, DocState, InsertNodeDocOp, MergeNodeDocOp, MoveNodeDocOp, NewDocNode, SplitNodeDocOp } from './types.js'
import { deltaLength } from './delta/builder.js'
import { orderedChildren } from './doc/state.js'
import { OtValidationError } from './errors.js'
import { generateOrderKey } from './orderKey.js'

/** Where a node goes: under `parentId`, right after sibling `after` (`null`: first). */
export interface NodePosition {
  parentId: string | null
  after: string | null
}

/** A node, or a validation error. */
function requireNode(state: DocState, id: string): DocNodeRecord {
  const node = state.nodes.get(id)
  if (!node) {
    throw new OtValidationError(`unknown node ${id}`)
  }
  return node
}

/**
 * Keys around a position among the parent's children (hidden ones included,
 * so a key never collides with a deleted sibling that could be restored).
 * Siblings sharing the anchor's key (concurrent inserts) are skipped.
 */
function keyBounds(state: DocState, { parentId, after }: NodePosition, exclude?: string): [string | null, string | null] {
  const siblings = orderedChildren(state, parentId, { includeDeleted: true }).filter(node => node.id !== exclude)
  if (after === null) {
    return [null, siblings[0]?.orderKey ?? null]
  }
  const index = siblings.findIndex(node => node.id === after)
  if (index === -1) {
    throw new OtValidationError(`${after} is not a child of ${String(parentId)}`)
  }
  const before = siblings[index]!.orderKey
  const next = siblings.slice(index + 1).find(node => node.orderKey > before)
  return [before, next?.orderKey ?? null]
}

/** Op inserting a new node at a position. */
export function insertNodeOp(state: DocState, node: Omit<NewDocNode, 'parentId' | 'orderKey'>, position: NodePosition): InsertNodeDocOp {
  const [before, after] = keyBounds(state, position)
  return { t: 'insertNode', node: { ...node, parentId: position.parentId, orderKey: generateOrderKey(before, after) } }
}

/** Op moving a node to a position. */
export function moveNodeOp(state: DocState, id: string, position: NodePosition): MoveNodeDocOp {
  requireNode(state, id)
  const [before, after] = keyBounds(state, position, id)
  return { t: 'moveNode', node: id, parentId: position.parentId, orderKey: generateOrderKey(before, after) }
}

/** Options of `splitNodeOp`. */
export interface SplitNodeOptions {
  /** Type of the new node (always written to the op). @default the split node's type */
  newType?: string
  /** Attributes of the new node. @default {} */
  newAttrs?: Record<string, unknown>
  /** Where the new node goes. @default right after the split node */
  position?: NodePosition
}

/**
 * Op splitting a textblock at an offset (Enter): the tail moves to a new
 * sibling right after it. Records the key range so a concurrent split of the
 * same node can keep both new nodes in text order.
 */
export function splitNodeOp(state: DocState, id: string, at: number, newNode: string, options: SplitNodeOptions = {}): SplitNodeDocOp {
  const node = requireNode(state, id)
  const position = options.position ?? { parentId: node.parentId, after: id }
  const [before, after] = keyBounds(state, position)
  const op: SplitNodeDocOp = {
    t: 'splitNode',
    node: id,
    at,
    newNode,
    parentId: position.parentId,
    orderKey: generateOrderKey(before, after),
    keyRange: [before, after],
  }
  op.newType = options.newType ?? node.type
  if (options.newAttrs) {
    op.newAttrs = options.newAttrs
  }
  return op
}

/** Op merging a textblock into another one (Backspace at its start: into the previous textblock). */
export function mergeNodeOp(state: DocState, id: string, into: string): MergeNodeDocOp {
  requireNode(state, id)
  const target = requireNode(state, into)
  if (target.content === null) {
    throw new OtValidationError(`${into} is not a textblock`)
  }
  return { t: 'mergeNode', node: id, into, at: deltaLength(target.content) }
}
