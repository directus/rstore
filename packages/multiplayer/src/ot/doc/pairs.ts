import type { DeleteNodeDocOp, DocOp, MergeNodeDocOp, MoveNodeDocOp, RestoreNodeDocOp, SetAttrsDocOp, SetTypeDocOp, SplitNodeDocOp, TextDocOp, TextOp, TransformOptions } from '../types.js'
import { shiftTextOp, splitTextOp } from '../delta/slice.js'
import { transformTextOp, transformTextPosition } from '../delta/transform.js'
import { OtTransformConflict } from '../errors.js'
import { tryGenerateOrderKey } from '../orderKey.js'
import { compareSiblings } from './state.js'

/** `[x', y']`: `x'` applies after `y`, `y'` applies after `x`. */
export type TransformedPair = [DocOp[], DocOp[]]

/** Transform of a pair of ops given which one the server sequenced first. */
type PairHandler = (x: any, y: any, xIsFirst: boolean, options?: TransformOptions) => TransformedPair

/** A text op, or nothing when it has no component left. */
function textOp(node: string, ops: TextOp): TextDocOp[] {
  return ops.length ? [{ t: 'text', node, ops }] : []
}

/** No interaction: both ops stay as they are. */
const identity = (x: DocOp, y: DocOp): TransformedPair => [[x], [y]]

/** For two ops on the same node where only the later sequenced one should take effect. */
function laterWins(x: { node: string }, y: { node: string }, xIsFirst: boolean): TransformedPair {
  if (x.node !== y.node) {
    return identity(x as DocOp, y as DocOp)
  }
  return xIsFirst ? [[], [y as DocOp]] : [[x as DocOp], []]
}

/** A sibling key strictly between bounds; `undefined` bounds (unknown) give `null`. */
function rekey(before: string | null | undefined, after: string | null | undefined): string | null {
  return before === undefined || after === undefined ? null : tryGenerateOrderKey(before, after)
}

/**
 * Two splits of the same node (`a` sequenced first). The later split point
 * is mapped through the first split (into the new node when it falls in its
 * tail). Both new nodes must then be ordered like their text: when their
 * keys say otherwise, the later node is re-keyed inside its authored key
 * range, and the first op's transform moves it the same way.
 */
function splitVsSplit(a: SplitNodeDocOp, b: SplitNodeDocOp): TransformedPair {
  if (a.newNode === b.newNode || a.newNode === b.node || b.newNode === a.node) {
    throw new OtTransformConflict(`concurrent splits creating ${b.newNode}`)
  }
  if (a.node !== b.node) {
    return identity(a, b)
  }
  const aKey = { orderKey: a.orderKey, id: a.newNode }
  const bKey = { orderKey: b.orderKey, id: b.newNode }
  const range = b.keyRange
  let key = b.orderKey
  let first: DocOp[]
  let later: SplitNodeDocOp
  if (b.at < a.at) {
    // b's new node holds [b.at, a.at) and must sort before a's new node.
    if (compareSiblings(bKey, aKey) > 0) {
      key = rekey(range ? range[0] : undefined, a.orderKey) ?? key
    }
    later = { ...b, orderKey: key }
    first = [{ ...a, node: b.newNode, at: a.at - b.at }]
  }
  else {
    // b's split point is in a's tail: it splits a's new node, after it.
    if (compareSiblings(bKey, aKey) < 0) {
      key = rekey(a.orderKey, range ? range[1] : undefined) ?? key
    }
    later = { ...b, node: a.newNode, at: b.at - a.at, orderKey: key }
    first = [a]
  }
  if (key !== b.orderKey) {
    first.push({ t: 'moveNode', node: b.newNode, parentId: b.parentId, orderKey: key })
  }
  return [first, [later]]
}

/**
 * Pair handlers keyed `x.t|y.t`. A missing key falls back to the mirrored
 * handler, then to identity (ops on unrelated nodes commute).
 */
const handlers: Record<string, PairHandler> = {
  'text|text': (x: TextDocOp, y: TextDocOp, xIsFirst, options) => {
    if (x.node !== y.node) {
      return identity(x, y)
    }
    return [
      textOp(x.node, transformTextOp(x.ops, y.ops, xIsFirst, options)),
      textOp(y.node, transformTextOp(y.ops, x.ops, !xIsFirst, options)),
    ]
  },
  'text|splitNode': (x: TextDocOp, y: SplitNodeDocOp) => {
    if (x.node === y.node) {
      // Text typed exactly at the split point stays in the head.
      const [head, tail] = splitTextOp(x.ops, y.at)
      return [[...textOp(y.node, head), ...textOp(y.newNode, tail)], [{ ...y, at: transformTextPosition(x.ops, y.at, 'right') }]]
    }
    // A split reviving `x.node` overwrites its content.
    return x.node === y.newNode ? [[], [y]] : identity(x, y)
  },
  'text|mergeNode': (x: TextDocOp, y: MergeNodeDocOp) => {
    if (x.node === y.node) {
      return [textOp(y.into, shiftTextOp(x.ops, y.at)), [y]]
    }
    if (x.node === y.into) {
      return [[x], [{ ...y, at: transformTextPosition(x.ops, y.at, 'right') }]]
    }
    return identity(x, y)
  },
  'splitNode|splitNode': (x: SplitNodeDocOp, y: SplitNodeDocOp, xIsFirst) => {
    if (xIsFirst) {
      return splitVsSplit(x, y)
    }
    const [first, later] = splitVsSplit(y, x)
    return [later, first]
  },
  'splitNode|mergeNode': (x: SplitNodeDocOp, y: MergeNodeDocOp) => {
    if (y.node === x.newNode || y.into === x.newNode) {
      throw new OtTransformConflict(`merge involving ${x.newNode} concurrent with its revival`)
    }
    if (y.node === x.node) {
      // The split source was merged: split the merge target instead.
      return [[{ ...x, node: y.into, at: y.at + x.at }], [y]]
    }
    if (y.into === x.node) {
      // Merged content lands after the split point: it goes to the new node.
      return [[x], [{ ...y, into: x.newNode, at: y.at - x.at }]]
    }
    return identity(x, y)
  },
  'mergeNode|mergeNode': (x: MergeNodeDocOp, y: MergeNodeDocOp) => {
    if (x.node === y.node) {
      if (x.into === y.into) {
        return [[], []]
      }
      throw new OtTransformConflict(`${x.node} merged into two different nodes`)
    }
    if (x.into === y.into || (x.node === y.into && x.into === y.node)) {
      throw new OtTransformConflict(`concurrent merges into ${x.into}`)
    }
    if (x.into === y.node) {
      return [[{ ...x, into: y.into, at: y.at + x.at }], [y]]
    }
    if (y.into === x.node) {
      return [[x], [{ ...y, into: x.into, at: x.at + y.at }]]
    }
    return identity(x, y)
  },
  'deleteNode|splitNode': (x: DeleteNodeDocOp, y: SplitNodeDocOp) => {
    if (x.node === y.newNode) {
      return [[], [y]]
    }
    if (x.node === y.node) {
      // Splitting a deleted node keeps both parts hidden.
      const hideNew: DocOp = { t: 'deleteNode', node: y.newNode }
      return [[x, hideNew], [y, hideNew]]
    }
    return identity(x, y)
  },
  'restoreNode|splitNode': (x: RestoreNodeDocOp, y: SplitNodeDocOp) => {
    if (x.node === y.newNode) {
      // Someone restored the node a split (undo of a merge) revives: keeping
      // both would clobber the restored node.
      throw new OtTransformConflict(`${y.newNode} restored and revived concurrently`)
    }
    return identity(x, y)
  },
  'moveNode|splitNode': (x: MoveNodeDocOp, y: SplitNodeDocOp) => x.node === y.newNode ? [[], [y]] : identity(x, y),
  'setAttrs|splitNode': (x: SetAttrsDocOp, y: SplitNodeDocOp) => x.node === y.newNode ? [[], [y]] : identity(x, y),
  'setType|splitNode': (x: SetTypeDocOp, y: SplitNodeDocOp) => x.node === y.newNode ? [[], [y]] : identity(x, y),
  'setType|setType': laterWins,
  'deleteNode|mergeNode': (x: DeleteNodeDocOp, y: MergeNodeDocOp, xIsFirst) => {
    if (x.node === y.node) {
      return [[], [y]]
    }
    if (x.node === y.into && xIsFirst) {
      // A merge sequenced after the target's deletion revives the target
      // (on both paths, whatever its state was before the deletion).
      const restore: DocOp = { t: 'restoreNode', node: y.into }
      return [[restore], [restore, y]]
    }
    return identity(x, y)
  },
  'restoreNode|mergeNode': (x: RestoreNodeDocOp, y: MergeNodeDocOp) => x.node === y.node ? [[], [y]] : identity(x, y),
  'deleteNode|deleteNode': laterWins,
  'deleteNode|restoreNode': laterWins,
  'restoreNode|restoreNode': laterWins,
  'moveNode|moveNode': laterWins,
  'setAttrs|setAttrs': (x: SetAttrsDocOp, y: SetAttrsDocOp, xIsFirst) => {
    if (x.node !== y.node) {
      return identity(x, y)
    }
    // Per-key LWW: the first sequenced op loses the keys the later one sets.
    const [first, later] = xIsFirst ? [x, y] : [y, x]
    const attrs: Record<string, unknown> = {}
    for (const key in first.attrs) {
      if (!(key in later.attrs)) {
        attrs[key] = first.attrs[key]
      }
    }
    const firstPrime: DocOp[] = Object.keys(attrs).length ? [{ ...first, attrs }] : []
    return xIsFirst ? [firstPrime, [y]] : [[x], firstPrime]
  },
  'insertNode|insertNode': (x, y) => {
    if (x.node.id === y.node.id) {
      throw new OtTransformConflict(`node ${x.node.id} inserted twice`)
    }
    return identity(x, y)
  },
  'insertNode|splitNode': (x, y: SplitNodeDocOp) => {
    if (x.node.id === y.newNode) {
      throw new OtTransformConflict(`node ${y.newNode} created twice`)
    }
    return identity(x, y)
  },
}

/**
 * Transforms two concurrent ops: `first` was sequenced before `later`.
 * Throws `OtTransformConflict` when both cannot be kept.
 */
export function transformOpPair(first: DocOp, later: DocOp, options?: TransformOptions): TransformedPair {
  const handler = handlers[`${first.t}|${later.t}`]
  if (handler) {
    return handler(first, later, true, options)
  }
  const mirrored = handlers[`${later.t}|${first.t}`]
  if (mirrored) {
    const [laterPrime, firstPrime] = mirrored(later, first, false, options)
    return [firstPrime, laterPrime]
  }
  return identity(first, later)
}
