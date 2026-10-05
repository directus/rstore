import type { Mark, Node as PMNode, Schema } from 'prosemirror-model'
import type { Delta, DeltaAttributes, DocNodeRecord, DocState } from '../ot/types.js'
import { normalizeDelta } from '../ot/delta/builder.js'
import { orderedChildren } from '../ot/doc/state.js'

/** Attribute holding the stable node id on every block node of the schema. */
export const NODE_ID_ATTR = 'id'

/**
 * Marks as Delta attributes: `{ [markName]: true }` for a mark without
 * attributes, `{ [markName]: attrs }` otherwise.
 */
export function marksToAttributes(marks: readonly Mark[]): DeltaAttributes | undefined {
  if (!marks.length) {
    return undefined
  }
  const attributes: DeltaAttributes = {}
  for (const mark of marks) {
    attributes[mark.type.name] = Object.keys(mark.attrs).length ? { ...mark.attrs } : true
  }
  return attributes
}

/** Delta attributes back to marks (unknown mark names are ignored). */
export function attributesToMarks(schema: Schema, attributes: DeltaAttributes | undefined): Mark[] {
  const marks: Mark[] = []
  for (const name in attributes ?? {}) {
    const type = schema.marks[name]
    const value = attributes![name]
    if (type && value !== null && value !== undefined && value !== false) {
      marks.push(type.create(value === true ? null : value as Record<string, unknown>))
    }
  }
  return marks
}

/** Inline content of a textblock as a Delta (inline leaf nodes become embeds). */
export function textblockToDelta(node: PMNode): Delta {
  const runs: Delta = []
  node.forEach((child) => {
    const attributes = marksToAttributes(child.marks)
    const insert = child.isText ? child.text! : { [child.type.name]: Object.keys(child.attrs).length ? { ...child.attrs } : true }
    runs.push(attributes ? { insert, attributes } : { insert })
  })
  return normalizeDelta(runs)
}

/** A Delta as inline PM nodes. */
export function deltaToInline(schema: Schema, content: Delta): PMNode[] {
  return content.map((run) => {
    const marks = attributesToMarks(schema, run.attributes)
    if (typeof run.insert === 'string') {
      return schema.text(run.insert, marks)
    }
    const [name, value] = Object.entries(run.insert)[0]!
    return schema.nodes[name]!.create(value === true ? null : value as Record<string, unknown>, null, marks)
  })
}

/** Builds the PM node of a record and its visible subtree. */
function recordToNode(schema: Schema, state: DocState, record: DocNodeRecord): PMNode {
  const type = schema.nodes[record.type]
  if (!type) {
    throw new Error(`[rstore prosemirror] unknown node type ${record.type}`)
  }
  const attrs = { ...record.attrs, [NODE_ID_ATTR]: record.id }
  if (record.content !== null) {
    return type.create(attrs, deltaToInline(schema, record.content))
  }
  return type.create(attrs, orderedChildren(state, record.id).map(child => recordToNode(schema, state, child)))
}

/** The visible document as a PM doc node (root records are the doc's children). */
export function docStateToNode(schema: Schema, state: DocState): PMNode {
  return schema.topNodeType.create(null, orderedChildren(state, null).map(record => recordToNode(schema, state, record)))
}

/** One block of a PM doc, flattened in document order. */
export interface FlatBlock {
  id: string
  parentId: string | null
  type: string
  attrs: Record<string, unknown>
  /** Delta for textblocks, `null` for containers. */
  content: Delta | null
  /** Absolute position of the node in the PM doc. */
  pos: number
}

/** Block nodes of a PM doc in document order (preorder), with their ids. */
export function flattenBlocks(doc: PMNode): FlatBlock[] {
  const blocks: FlatBlock[] = []
  const walk = (node: PMNode, offset: number, parentId: string | null) => {
    node.forEach((child, childOffset) => {
      if (!child.isBlock) {
        return
      }
      const { [NODE_ID_ATTR]: id, ...attrs } = child.attrs
      const pos = offset + childOffset
      blocks.push({ id: id as string, parentId, type: child.type.name, attrs, content: child.isTextblock ? textblockToDelta(child) : null, pos })
      if (!child.isTextblock) {
        walk(child, pos + 1, id as string)
      }
    })
  }
  walk(doc, 0, null)
  return blocks
}
