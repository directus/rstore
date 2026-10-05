import type { DocNodeRecord, DocOp } from '../ot/types.js'
import { fieldValuesEqual } from '@rstore/shared'
import { diffDelta } from '../ot/delta/diff.js'

/**
 * Ops that turn the peer's view of the touched nodes from `before` into
 * `after` (views are `null` when the node is hidden or does not exist).
 * Used for ops that mix hidden and visible nodes or touch reduced nodes:
 * the peer receives the effect, never the hidden ids or values.
 *
 * Order: creations (parents first), then per node restore, move, type,
 * attributes, text, delete, so every op applies on the peer. Every visible
 * node of `ids` is touched, so the peer stamps it with the entry's version.
 */
export function rewriteForView(ids: string[], before: Map<string, DocNodeRecord | null>, after: Map<string, DocNodeRecord | null>): DocOp[] {
  const created = ids.filter(id => !before.get(id) && after.get(id))
  const createdIds = new Set(created)
  const depth = (id: string): number => {
    const parent = after.get(id)?.parentId
    return parent && createdIds.has(parent) ? 1 + depth(parent) : 0
  }
  const ops: DocOp[] = []
  for (const id of created.sort((a, b) => depth(a) - depth(b))) {
    const { parentId, orderKey, type, attrs, content, deleted } = after.get(id)!
    ops.push({ t: 'insertNode', node: { id, parentId, orderKey, type, attrs, content } })
    if (deleted) {
      ops.push({ t: 'deleteNode', node: id })
    }
  }
  for (const id of ids) {
    const previous = before.get(id)
    const next = after.get(id)
    if (!previous) {
      continue
    }
    if (!next) {
      // The node left the peer's view: it keeps a soft-deleted copy.
      if (!previous.deleted) {
        ops.push({ t: 'deleteNode', node: id })
      }
      continue
    }
    const changes = changeOps(previous, next)
    // Even an invisible change stamps the node with the entry's version:
    // an empty `setAttrs` touches it without changing it.
    ops.push(...(changes.length ? changes : [{ t: 'setAttrs', node: id, attrs: {} } satisfies DocOp]))
  }
  return ops
}

/** Ops turning one visible node into its next version. */
function changeOps(previous: DocNodeRecord, next: DocNodeRecord): DocOp[] {
  const { id } = next
  const ops: DocOp[] = []
  if (previous.deleted && !next.deleted) {
    ops.push({ t: 'restoreNode', node: id })
  }
  if (previous.parentId !== next.parentId || previous.orderKey !== next.orderKey) {
    ops.push({ t: 'moveNode', node: id, parentId: next.parentId, orderKey: next.orderKey })
  }
  if (previous.type !== next.type) {
    ops.push({ t: 'setType', node: id, type: next.type })
  }
  const attrs: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(previous.attrs), ...Object.keys(next.attrs)])) {
    if (!(key in next.attrs)) {
      attrs[key] = null
    }
    else if (!fieldValuesEqual(previous.attrs[key], next.attrs[key])) {
      attrs[key] = next.attrs[key]
    }
  }
  if (Object.keys(attrs).length) {
    ops.push({ t: 'setAttrs', node: id, attrs })
  }
  if (previous.content && next.content && !fieldValuesEqual(previous.content, next.content)) {
    ops.push({ t: 'text', node: id, ops: diffDelta(previous.content, next.content) })
  }
  if (!previous.deleted && next.deleted) {
    ops.push({ t: 'deleteNode', node: id })
  }
  return ops
}
