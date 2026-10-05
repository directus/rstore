import type { Node as PMNode } from 'prosemirror-model'
import type { Command, EditorState, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { CollabClient } from '../ot/client.js'
import type { CompositionGuardOptions } from '../ot/composition.js'
import type { Delta, DocOp } from '../ot/types.js'
import type { CollabUndoManager } from '../ot/undo.js'
import { Plugin, PluginKey } from 'prosemirror-state'
import { createCompositionGuard } from '../ot/composition.js'
import { rebuildTransaction, remoteTransaction } from './apply.js'
import { NODE_ID_ATTR, textblockToDelta } from './convert.js'
import { diffDocument } from './diff.js'

/** Options of `collabPlugin`. */
export interface CollabPluginOptions {
  client: CollabClient
  /** Undo manager of the client; the plugin ends its typing group around compositions. */
  undo?: CollabUndoManager
  composition?: Omit<CompositionGuardOptions, 'readComposingContent' | 'onForcedFlush' | 'transform'>
  /** New block ids. @default crypto.randomUUID */
  createId?: () => string
}

/** Key of the collab plugin; transactions it dispatches carry `'remote'` as meta. */
export const collabPluginKey = new PluginKey<null>('rstore-collab')

/** Content of the textblock with this id in a PM doc. */
function contentOf(doc: PMNode, id: string): Delta | undefined {
  let content: Delta | undefined
  doc.descendants((node) => {
    if (content || !node.isBlock) {
      return false
    }
    if (node.attrs[NODE_ID_ATTR] === id && node.isTextblock) {
      content = textblockToDelta(node)
    }
    return !node.isTextblock
  })
  return content
}

/** Block ids by position. */
function blockIds(doc: PMNode): Map<string, number> {
  const ids = new Map<string, number>()
  doc.descendants((node, pos) => {
    if (node.isBlock && typeof node.attrs[NODE_ID_ATTR] === 'string') {
      ids.set(node.attrs[NODE_ID_ATTR] as string, pos)
    }
    return !node.isTextblock
  })
  return ids
}

/**
 * Gives every block node a unique id: new blocks and copies a split made get
 * a fresh one; a block replaced in place (type change) keeps the id of the
 * block it replaced, so it stays the same record.
 */
function assignIds(transactions: readonly Transaction[], old: EditorState, state: EditorState, createId: () => string): Transaction | null {
  let tr: Transaction | null = null
  const seen = new Set<string>()
  const current = blockIds(state.doc)
  const lostAt = new Map<number, string>()
  for (const [id, pos] of blockIds(old.doc)) {
    if (!current.has(id)) {
      const mapped = transactions.reduce((position, transaction) => transaction.mapping.map(position), pos)
      lostAt.set(mapped, id)
    }
  }
  state.doc.descendants((node, pos) => {
    if (!node.isBlock) {
      return false
    }
    const id = node.attrs[NODE_ID_ATTR]
    if (typeof id !== 'string' || seen.has(id)) {
      const fresh = typeof id !== 'string' && lostAt.has(pos) && !seen.has(lostAt.get(pos)!) ? lostAt.get(pos)! : createId()
      tr ??= state.tr
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, [NODE_ID_ATTR]: fresh })
      seen.add(fresh)
    }
    else {
      seen.add(id)
    }
    return !node.isTextblock
  })
  return tr && (tr as Transaction).setMeta('addToHistory', false)
}

/**
 * ProseMirror binding of a collab client (prototype, spike X1). The schema
 * must give every block node an `id` attribute. Local transactions are
 * diffed against the client state into ops (splits and merges recognized);
 * remote ops become PM steps. During an IME composition the composing
 * textblock is neither sent nor touched by remote ops (composition guard).
 */
export function collabPlugin(options: CollabPluginOptions): Plugin {
  const { client } = options
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID())
  return new Plugin({
    key: collabPluginKey,
    appendTransaction: (transactions, old, state) => transactions.some(tr => tr.docChanged) ? assignIds(transactions, old, state, createId) : null,
    view(view: EditorView) {
      let submitting = false
      let compositionEnded = false
      /** Dispatches a state copied from the collab client without echoing it back as a local edit. */
      const dispatchRemote = (transaction: Transaction) => {
        const wasSubmitting = submitting
        submitting = true
        try {
          view.dispatch(transaction.setMeta(collabPluginKey, 'remote').setMeta('addToHistory', false))
        }
        finally {
          submitting = wasSubmitting
        }
      }
      const dispatchOps = (ops: DocOp[]) => {
        if (ops.length) {
          dispatchRemote(remoteTransaction(view.state, ops, client.state))
        }
      }
      const guard = createCompositionGuard(client, {
        ...options.composition,
        readComposingContent: id => contentOf(view.state.doc, id),
        onForcedFlush: dispatchOps,
      })
      /** Sends what changed in the view since the client state. */
      const submitView = () => {
        const ops = diffDocument(client.state, view.state.doc, { frozenNode: guard.composing ? guard.nodeId : null })
        if (ops.length) {
          submitting = true
          try {
            client.submit(ops)
          }
          finally {
            submitting = false
          }
        }
      }
      /** Ends a composition once ProseMirror is done with it. */
      const finishComposition = () => {
        if (!guard.composing || view.composing) {
          return
        }
        compositionEnded = false
        const content = contentOf(view.state.doc, guard.nodeId!) ?? []
        submitting = true
        try {
          dispatchOps(guard.end(content).dispatch)
        }
        finally {
          submitting = false
        }
        options.undo?.stopCapturing()
        submitView()
      }
      const stop = client.on('change', (event) => {
        if (event.origin === 'local' && submitting) {
          return
        }
        if (event.origin === 'reset') {
          dispatchRemote(rebuildTransaction(view.state, client.state))
          return
        }
        // Remote ops, rollbacks, and local ops not made in the view (undo).
        const dispatch = event.origin === 'local' ? event.ops : guard.receive(event.ops)
        if (dispatch) {
          dispatchOps(dispatch)
        }
      })
      // `restore` constructs an already-loaded client before the view subscribes, so no reset event remains to render it.
      if (client.loaded) {
        dispatchRemote(rebuildTransaction(view.state, client.state))
      }
      const onCompositionStart = () => {
        const id = view.state.selection.$head.parent.attrs[NODE_ID_ATTR]
        if (typeof id === 'string') {
          submitView()
          options.undo?.stopCapturing()
          guard.start(id)
        }
      }
      const onCompositionEnd = () => {
        compositionEnded = true
        setTimeout(finishComposition, 0)
      }
      view.dom.addEventListener('compositionstart', onCompositionStart)
      view.dom.addEventListener('compositionend', onCompositionEnd)
      return {
        update(view, previous) {
          if (view.state.doc.eq(previous.doc)) {
            return
          }
          if (compositionEnded) {
            finishComposition()
          }
          if (!submitting) {
            submitView()
          }
        },
        destroy() {
          stop()
          view.dom.removeEventListener('compositionstart', onCompositionStart)
          view.dom.removeEventListener('compositionend', onCompositionEnd)
        },
      }
    },
  })
}

/** Undo command for the collab undo manager (per user, not ProseMirror's history). */
export function collabUndo(undo: CollabUndoManager): Command {
  return (_state, dispatch) => {
    if (!undo.canUndo) {
      return false
    }
    if (dispatch) {
      undo.undo()
    }
    return true
  }
}

/** Redo command for the collab undo manager. */
export function collabRedo(undo: CollabUndoManager): Command {
  return (_state, dispatch) => {
    if (!undo.canRedo) {
      return false
    }
    if (dispatch) {
      undo.redo()
    }
    return true
  }
}
