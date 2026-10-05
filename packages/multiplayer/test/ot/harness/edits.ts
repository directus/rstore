import type { DocOp } from '@rstore/multiplayer/ot'

/** Inserts text (optionally with marks) at an offset of a textblock. */
export function insertText(node: string, at: number, text: string | Record<string, unknown>, attributes?: Record<string, unknown>): DocOp {
  const insert = attributes ? { insert: text, attributes } : { insert: text }
  return { t: 'text', node, ops: at > 0 ? [{ retain: at }, insert] : [insert] }
}

/** Deletes the units `[from, to)` of a textblock. */
export function deleteText(node: string, from: number, to: number): DocOp {
  return { t: 'text', node, ops: from > 0 ? [{ retain: from }, { delete: to - from }] : [{ delete: to - from }] }
}

/** Formats the units `[from, to)` of a textblock (`null` removes a mark). */
export function formatText(node: string, from: number, to: number, attributes: Record<string, unknown>): DocOp {
  const format = { retain: to - from, attributes }
  return { t: 'text', node, ops: from > 0 ? [{ retain: from }, format] : [format] }
}
