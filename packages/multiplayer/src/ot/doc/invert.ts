import type { DocNodeRecord, DocOp, DocState } from '../types.js'
import { invertTextOp } from '../delta/compose.js'
import { OtValidationError } from '../errors.js'
import { applyDocOps } from './apply.js'
import { cloneDocState } from './state.js'

/** Inverse of one op, given the node records before it. */
function invertOne(state: DocState, op: DocOp): DocOp[] {
  const node = (id: string): DocNodeRecord => {
    const record = state.nodes.get(id)
    if (!record || (op.t === 'text' && record.content === null)) {
      throw new OtValidationError(`${op.t}: unknown node ${id}`)
    }
    return record
  }
  switch (op.t) {
    case 'text':
      return [{ t: 'text', node: op.node, ops: invertTextOp(op.ops, node(op.node).content!) }]
    case 'insertNode':
      if (state.nodes.has(op.node?.id)) {
        throw new OtValidationError(`insertNode: node ${op.node.id} already exists`)
      }
      return [{ t: 'deleteNode', node: op.node.id }]
    case 'deleteNode':
      return node(op.node).deleted ? [] : [{ t: 'restoreNode', node: op.node }]
    case 'restoreNode':
      return node(op.node).deleted ? [{ t: 'deleteNode', node: op.node }] : []
    case 'moveNode': {
      const { parentId, orderKey } = node(op.node)
      return [{ t: 'moveNode', node: op.node, parentId, orderKey }]
    }
    case 'setAttrs': {
      const previous = node(op.node).attrs
      const attrs: Record<string, unknown> = {}
      for (const key in op.attrs) {
        attrs[key] = key in previous ? previous[key] : null
      }
      return [{ t: 'setAttrs', node: op.node, attrs }]
    }
    case 'setType':
      return [{ t: 'setType', node: op.node, type: node(op.node).type }]
    case 'splitNode': {
      const inverse: DocOp[] = [{ t: 'mergeNode', node: op.newNode, into: op.node, at: op.at }]
      const revived = state.nodes.get(op.newNode)
      if (revived) {
        if (op.newType !== undefined && op.newType !== revived.type) {
          inverse.push({ t: 'setType', node: revived.id, type: revived.type })
        }
        // Undoing a revival also restores where the node was and its attributes.
        inverse.push({ t: 'moveNode', node: revived.id, parentId: revived.parentId, orderKey: revived.orderKey })
        const attrs: Record<string, unknown> = {}
        for (const key in op.newAttrs ?? {}) {
          attrs[key] = null
        }
        Object.assign(attrs, revived.attrs)
        inverse.push({ t: 'setAttrs', node: revived.id, attrs })
      }
      return inverse
    }
    case 'mergeNode': {
      const merged = node(op.node)
      const inverse: DocOp[] = [{
        t: 'splitNode',
        node: op.into,
        at: op.at,
        newNode: merged.id,
        parentId: merged.parentId,
        orderKey: merged.orderKey,
        newType: merged.type,
        newAttrs: merged.attrs,
      }]
      if (merged.deleted) {
        inverse.push({ t: 'deleteNode', node: merged.id })
      }
      return inverse
    }
  }
}

/**
 * Ops that undo `ops` once they are applied to `state` (which is not
 * modified). Undoing an insert or a split hides the new node (soft delete);
 * undoing a merge revives the merged node with its id.
 *
 * @param state Document the ops apply to.
 * @param ops Valid ops on `state`.
 */
export function invertDocOps(state: DocState, ops: DocOp[]): DocOp[] {
  if (ops.length === 1) {
    return invertOne(state, ops[0]!)
  }
  const scratch = cloneDocState(state)
  const inverse: DocOp[] = []
  for (const op of ops) {
    inverse.unshift(...invertOne(scratch, op))
    applyDocOps(scratch, [op])
  }
  return inverse
}
