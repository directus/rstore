import type { Node as PMNode, Schema } from 'prosemirror-model'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { DocOp, DocState, TextOp } from '../ot/types.js'
import { Selection, TextSelection } from 'prosemirror-state'
import { attributesToMarks, deltaToInline, docStateToNode, NODE_ID_ATTR } from './convert.js'

/** Position just inside each block, by node id. */
function blockPositions(doc: PMNode): Map<string, number> {
  const positions = new Map<string, number>()
  doc.descendants((node, pos) => {
    if (node.isBlock && typeof node.attrs[NODE_ID_ATTR] === 'string') {
      positions.set(node.attrs[NODE_ID_ATTR] as string, pos + 1)
    }
    return !node.isTextblock
  })
  return positions
}

/** Replays a text op as PM steps at `start` (inside the textblock). */
function applyTextOpSteps(tr: Transaction, schema: Schema, start: number, ops: TextOp) {
  let pos = start
  for (const component of ops) {
    if ('insert' in component) {
      const nodes = deltaToInline(schema, [component])
      tr.insert(pos, nodes)
      pos += nodes.reduce((size, node) => size + node.nodeSize, 0)
    }
    else if ('delete' in component) {
      tr.delete(pos, pos + component.delete)
    }
    else {
      if (component.attributes) {
        for (const name in component.attributes) {
          const type = schema.marks[name]
          if (!type) {
            continue
          }
          tr.removeMark(pos, pos + component.retain, type)
          if (component.attributes[name] !== null) {
            for (const mark of attributesToMarks(schema, { [name]: component.attributes[name] })) {
              tr.addMark(pos, pos + component.retain, mark)
            }
          }
        }
      }
      pos += component.retain
    }
  }
}

/** Where the selection is, as (node id, offset) pairs that survive a rebuild. */
function selectionAnchors(state: EditorState): Array<[string, number] | null> {
  return [state.selection.anchor, state.selection.head].map((pos) => {
    const $pos = state.doc.resolve(pos)
    const id = $pos.parent.attrs[NODE_ID_ATTR]
    return typeof id === 'string' ? [id, $pos.parentOffset] : null
  })
}

/**
 * A PM transaction that brings the view to `target` after `ops` were
 * applied to the collab state. Text-only ops become precise steps (the
 * selection maps through them); structural ops rebuild the document from
 * `target` and put the selection back by node id and offset.
 */
export function remoteTransaction(state: EditorState, ops: DocOp[], target: DocState): Transaction {
  const tr = state.tr
  if (ops.every(op => op.t === 'text')) {
    for (const op of ops as Array<Extract<DocOp, { t: 'text' }>>) {
      const start = blockPositions(tr.doc).get(op.node)
      if (start !== undefined) {
        applyTextOpSteps(tr, state.schema, start, op.ops)
      }
    }
    return tr
  }
  return rebuildTransaction(state, target)
}

/** Replaces the whole document with `target`, keeping the selection by node id and offset. */
export function rebuildTransaction(state: EditorState, target: DocState): Transaction {
  const anchors = selectionAnchors(state)
  const doc = docStateToNode(state.schema, target)
  const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content)
  const positions = blockPositions(tr.doc)
  const [anchor, head] = anchors.map((entry) => {
    const start = entry && positions.get(entry[0])
    if (start === undefined || start === null) {
      return null
    }
    const node = tr.doc.resolve(start).parent
    return start + Math.min(entry![1], node.content.size)
  })
  if (anchor !== null && anchor !== undefined && head !== null && head !== undefined) {
    tr.setSelection(TextSelection.create(tr.doc, anchor, head))
  }
  else {
    tr.setSelection(Selection.atStart(tr.doc))
  }
  return tr
}
