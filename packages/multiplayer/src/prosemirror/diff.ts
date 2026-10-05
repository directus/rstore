import type { Node as PMNode } from 'prosemirror-model'
import type { DocNodeRecord, DocOp, DocState } from '../ot/types.js'
import type { FlatBlock } from './convert.js'
import { fieldValuesEqual } from '@rstore/shared'
import { insertNodeOp, mergeNodeOp, moveNodeOp, splitNodeOp } from '../ot/authoring.js'
import { deltaLength } from '../ot/delta/builder.js'
import { diffDelta } from '../ot/delta/diff.js'
import { concatDelta } from '../ot/delta/slice.js'
import { applyDocOps } from '../ot/doc/apply.js'
import { cloneDocState, isNodeVisible, orderedChildren } from '../ot/doc/state.js'
import { flattenBlocks } from './convert.js'

/** Options of `diffDocument`. */
export interface DiffDocumentOptions {
  /**
   * A textblock whose view content must not be diffed (IME composition in
   * progress): it keeps its current state content.
   */
  frozenNode?: string | null
}

/**
 * The ops that turn the visible document of `state` into the PM `doc`
 * (blocks matched by id). Enter and Backspace at a block boundary are
 * recognized as `splitNode`/`mergeNode` (exact text match), so concurrent
 * typing in the moved text follows it; anything else becomes inserts,
 * deletes, moves, attribute and text changes. Each op is applied to a
 * scratch copy as it is produced, so the list applies in order.
 */
export function diffDocument(state: DocState, doc: PMNode, options: DiffDocumentOptions = {}): DocOp[] {
  const scratch = cloneDocState(state)
  const ops: DocOp[] = []
  const emit = (op: DocOp) => {
    applyDocOps(scratch, [op])
    ops.push(op)
  }
  const blocks = flattenBlocks(doc).map(block => block.id === options.frozenNode && state.nodes.get(block.id)?.content
    ? { ...block, content: state.nodes.get(block.id)!.content }
    : block)
  const ids = new Set(blocks.map(block => block.id))
  const textblocks = blocks.filter(block => block.content !== null)

  // Containers first (a split may move text into a new list item), then
  // splits and plain inserts, in document order.
  for (const block of blocks) {
    const existing = state.nodes.get(block.id)
    if (existing) {
      // Shown again (undo in the view): restore, content is diffed below.
      if (!isNodeVisible(scratch, block.id) && existing.deleted) {
        emit({ t: 'restoreNode', node: block.id })
      }
      continue
    }
    const position = { parentId: block.parentId, after: previousSibling(block, blocks) }
    const previous = textblocks[textblocks.indexOf(block) - 1]
    const source = previous && scratch.nodes.get(previous.id)
    if (block.content && source?.content && fieldValuesEqual(concatDelta(previous!.content!, block.content), source.content)) {
      emit(splitNodeOp(scratch, source.id, deltaLength(previous!.content!), block.id, { newType: block.type, newAttrs: block.attrs, position }))
    }
    else {
      emit(insertNodeOp(scratch, { id: block.id, type: block.type, attrs: block.attrs, content: block.content }, position))
    }
  }

  // Blocks gone from the view: merged into the previous textblock, or deleted.
  const oldTextblocks = visibleTextblocks(state)
  for (const [index, record] of oldTextblocks.entries()) {
    if (ids.has(record.id)) {
      continue
    }
    const target = oldTextblocks.slice(0, index).reverse().find(candidate => ids.has(candidate.id))
    const targetBlock = target && blocks.find(block => block.id === target.id)
    const current = target && scratch.nodes.get(target.id)
    if (current?.content && targetBlock?.content && fieldValuesEqual(concatDelta(current.content, record.content!), targetBlock.content)) {
      emit(mergeNodeOp(scratch, record.id, target!.id))
    }
  }
  for (const record of state.nodes.values()) {
    if (!ids.has(record.id) && isNodeVisible(scratch, record.id) && (record.parentId === null || ids.has(record.parentId))) {
      emit({ t: 'deleteNode', node: record.id })
    }
  }

  // Moves, attributes and text of the remaining blocks.
  for (const block of blocks) {
    const record = scratch.nodes.get(block.id)!
    const after = previousSibling(block, blocks)
    const siblings = orderedChildren(scratch, block.parentId)
    const index = siblings.findIndex(sibling => sibling.id === block.id)
    if (record.parentId !== block.parentId || index === -1 || (siblings[index - 1]?.id ?? null) !== after) {
      emit(moveNodeOp(scratch, block.id, { parentId: block.parentId, after }))
    }
    if (record.type !== block.type) {
      emit({ t: 'setType', node: block.id, type: block.type })
    }
    const attrs = diffAttrs(record.attrs, block.attrs)
    if (attrs) {
      emit({ t: 'setAttrs', node: block.id, attrs })
    }
    if (block.content && record.content && !fieldValuesEqual(record.content, block.content)) {
      emit({ t: 'text', node: block.id, ops: diffDelta(record.content, block.content) })
    }
  }
  return ops
}

/** Previous sibling of a block in the view (`null` when first). */
function previousSibling(block: FlatBlock, blocks: FlatBlock[]): string | null {
  const siblings = blocks.filter(candidate => candidate.parentId === block.parentId)
  return siblings[siblings.indexOf(block) - 1]?.id ?? null
}

/** Visible textblocks of a state in document order. */
function visibleTextblocks(state: DocState): DocNodeRecord[] {
  const result: DocNodeRecord[] = []
  const walk = (parentId: string | null) => {
    for (const node of orderedChildren(state, parentId)) {
      if (node.content !== null) {
        result.push(node)
      }
      else {
        walk(node.id)
      }
    }
  }
  walk(null)
  return result
}

/** `setAttrs` payload turning `from` into `to`, or `null` when equal. */
function diffAttrs(from: Record<string, unknown>, to: Record<string, unknown>): Record<string, unknown> | null {
  const attrs: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (!fieldValuesEqual(from[key], to[key])) {
      attrs[key] = to[key] ?? null
    }
  }
  return Object.keys(attrs).length ? attrs : null
}
