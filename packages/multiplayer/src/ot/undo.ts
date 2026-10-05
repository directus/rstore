import type { CollabClient } from './client.js'
import type { DocOp, DocState, TransformOptions } from './types.js'
import { splitNodeOp } from './authoring.js'
import { composeDocOps } from './doc/compose.js'
import { ancestorIds, isNodeVisible } from './doc/state.js'
import { transformDocOps } from './doc/transform.js'

/** One undo (or redo) step: ops that revert a group of local transactions. */
interface UndoEntry {
  ops: DocOp[]
  /** Text node of a typing group (grouping key), or `null` for other edits. */
  node: string | null
  time: number
}

/** Options of `createCollabUndoManager`. */
export interface CollabUndoOptions {
  /** Consecutive transactions typing in the same node within this window form one step. @default 500 */
  groupMs?: number
  /** @default 100 */
  maxDepth?: number
  /** Must match the client's transform options. */
  transform?: TransformOptions
  /** @default Date.now */
  now?: () => number
}

/** The single text node a transaction types in, or `null`. */
function typingNode(ops: DocOp[]): string | null {
  const node = ops[0]?.t === 'text' ? ops[0].node : null
  return node && ops.every(op => op.t === 'text' && op.node === node) ? node : null
}

/**
 * Nodes that now hold content another user added (typed text, merged text,
 * split tails, inserted or moved children), with their ancestors. Undo never
 * hides them, so it never removes characters authored by someone else.
 */
function foreignContentNodes(state: DocState, ops: DocOp[]): Set<string> {
  const ids = new Set<string>()
  for (const op of ops) {
    if (op.t === 'text' && op.ops.some(component => 'insert' in component)) {
      ids.add(op.node)
    }
    else if (op.t === 'mergeNode') {
      ids.add(op.into)
    }
    else if (op.t === 'splitNode') {
      ids.add(op.node).add(op.newNode)
    }
    else if (op.t === 'insertNode') {
      // The new node holds the other user's content, and so does its parent.
      ids.add(op.node.id)
      if (op.node.parentId) {
        ids.add(op.node.parentId)
      }
    }
    else if (op.t === 'moveNode' || op.t === 'restoreNode') {
      // A node others moved or restored may hold their content.
      ids.add(op.node)
      if (op.t === 'moveNode' && op.parentId) {
        ids.add(op.parentId)
      }
    }
  }
  for (const id of [...ids]) {
    for (const ancestor of ancestorIds(state, id)) {
      ids.add(ancestor)
    }
  }
  return ids
}

/**
 * Per-user selective undo (ot.js `UndoManager`, Ressel & Gunzenhäuser):
 * each local transaction pushes its inverse; every remote op rebases every
 * stacked entry, so undo only reverts this user's own edits, transformed to
 * the current document. Entries never delete text or hide nodes holding
 * content another user added in the meantime.
 */
export function createCollabUndoManager(client: CollabClient, options: CollabUndoOptions = {}) {
  const groupMs = options.groupMs ?? 500
  const maxDepth = options.maxDepth ?? 100
  const now = options.now ?? Date.now
  let undoStack: UndoEntry[] = []
  let redoStack: UndoEntry[] = []
  let applying: 'undo' | 'redo' | null = null
  let capturing = true

  /** Nodes (and their ancestors) that received content from other users. */
  const foreign = new Set<string>()

  /** Rebases a stack over ops applied to the local state (newest entry first). */
  function rebaseStack(stack: UndoEntry[], ops: DocOp[]): UndoEntry[] {
    const result: UndoEntry[] = []
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i]!
      let transformed
      try {
        transformed = transformDocOps(ops, entry.ops, options.transform)
      }
      catch {
        // The entry cannot follow the document any more: drop it and older ones.
        break
      }
      ops = transformed.first
      const kept = transformed.later
      if (kept.length) {
        result.unshift({ ...entry, ops: kept })
      }
    }
    return result
  }

  /**
   * Drops the ops of an entry that would hide another user's content: a
   * delete of a node that ever received foreign content (also when a split
   * of the entry moves that content into the deleted node).
   */
  function dropForeignDeletes(ops: DocOp[], foreign: Set<string>): DocOp[] {
    const tainted = new Set(foreign)
    for (const op of ops) {
      if (op.t === 'splitNode' && tainted.has(op.node)) {
        tainted.add(op.newNode)
      }
    }
    return ops.filter(op => !(op.t === 'deleteNode' && tainted.has(op.node)))
  }

  /**
   * At undo time, drops moves under a hidden parent and merges into a
   * hidden node: both would hide visible text. They only change visibility
   * or the target of whole nodes, so the rest of the entry still applies
   * (the client validates it anyway).
   */
  function dropHidingOps(ops: DocOp[]): DocOp[] {
    const visible = (id: string) => isNodeVisible(client.state, id)
    return ops.filter(op => !(op.t === 'moveNode' && op.parentId !== null && !visible(op.parentId))
      && !(op.t === 'mergeNode' && !visible(op.into) && visible(op.node)))
  }

  /**
   * A split reviving a node under a parent deleted since (undo of a merge)
   * would hide the moved text: place the node right after the split node.
   */
  function relocateHiddenSplit(op: DocOp): DocOp {
    if (op.t !== 'splitNode' || op.parentId === null || isNodeVisible(client.state, op.parentId) || !client.state.nodes.has(op.node)) {
      return op
    }
    try {
      return splitNodeOp(client.state, op.node, op.at, op.newNode, { newType: op.newType, newAttrs: op.newAttrs })
    }
    catch {
      return op
    }
  }

  const stop = client.on('change', (event) => {
    if (event.origin === 'reset') {
      for (const id of foreignContentNodes(client.state, event.remote ?? [])) {
        foreign.add(id)
      }
      undoStack = []
      redoStack = []
      return
    }
    if (event.origin !== 'local') {
      if (event.origin === 'remote') {
        for (const id of foreignContentNodes(client.state, event.ops)) {
          foreign.add(id)
        }
      }
      undoStack = rebaseStack(undoStack, event.ops)
      redoStack = rebaseStack(redoStack, event.ops)
      return
    }
    // Local splits and merges (undo included) carry foreign content along.
    for (const op of event.ops) {
      if (op.t === 'splitNode' && foreign.has(op.node)) {
        foreign.add(op.newNode)
      }
      else if (op.t === 'mergeNode' && foreign.has(op.node)) {
        foreign.add(op.into)
      }
    }
    const inverse = event.inverse ?? []
    if (applying === 'undo') {
      redoStack.push({ ops: inverse, node: null, time: 0 })
      return
    }
    const node = typingNode(event.ops)
    const time = now()
    if (applying !== 'redo') {
      redoStack = []
    }
    const last = undoStack.at(-1)
    if (applying !== 'redo' && capturing && last && node && last.node === node && time - last.time <= groupMs) {
      // The newer inverse runs first when the group is undone.
      last.ops = composeDocOps(inverse, last.ops)
      last.time = time
      return
    }
    undoStack.push({ ops: inverse, node: applying === 'redo' ? null : node, time })
    capturing = true
    if (undoStack.length > maxDepth) {
      undoStack.shift()
    }
  })

  /** Applies the newest entry of a stack as a local transaction. */
  function step(stack: UndoEntry[], kind: 'undo' | 'redo'): boolean {
    while (stack.length) {
      const entry = stack.pop()!
      // Undo never hides what others wrote; redo replays this user's own action.
      const ops = dropHidingOps(kind === 'undo' ? dropForeignDeletes(entry.ops, foreign) : entry.ops).map(relocateHiddenSplit)
      if (!ops.length) {
        continue
      }
      applying = kind
      try {
        client.submit(ops)
        return true
      }
      catch {
        // No longer applicable (rare after rebasing): try the next one.
      }
      finally {
        applying = null
      }
    }
    return false
  }

  return {
    /** Reverts this user's latest step. Returns `false` when there is nothing to undo. */
    undo: (): boolean => step(undoStack, 'undo'),
    /** Re-applies the latest undone step. */
    redo: (): boolean => step(redoStack, 'redo'),
    get canUndo(): boolean {
      return undoStack.length > 0
    },
    get canRedo(): boolean {
      return redoStack.length > 0
    },
    /** Ends the current typing group (the next edit starts a new step), e.g. around an IME composition. */
    stopCapturing(): void {
      capturing = false
    },
    clear(): void {
      undoStack = []
      redoStack = []
      foreign.clear()
    },
    /** Stops listening to the client. */
    dispose: stop,
  }
}

/** An undo manager instance. */
export type CollabUndoManager = ReturnType<typeof createCollabUndoManager>
