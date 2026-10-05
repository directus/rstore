import type { CollabConflict, CollabPendingState } from './clientTypes.js'
import type { DocNodeRecord, DocOp, DocState } from './types.js'
import { fieldValuesEqual } from '@rstore/shared'
import { deltaLength } from './delta/builder.js'
import { applyDocOps } from './doc/apply.js'
import { cloneDocState, orderedChildren } from './doc/state.js'
import { mergeContent } from './fallback.js'
import { pendingTextOps, textUnitOrigins } from './fallbackIdentity.js'
import { tryGenerateOrderKey } from './orderKey.js'

/** Minimal async key-value storage (the IndexedDB adapter of `@rstore/offline` fits). */
export interface KeyValueStorage {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
}

/** Private partition for pending edits, supplied by the app's current session. */
export interface PendingStateStorageOptions {
  /** Include identity, tenant, document protocol and source in this value. */
  scope?: string
}

/** Storage key of a document's pending state. */
function pendingKey(docId: string, options: PendingStateStorageOptions) {
  return options.scope === undefined
    ? `rstore:ot:pending:${docId}`
    : `rstore:ot:pending:${options.scope}:${docId}`
}

/** Whether an unknown persisted value has enough structure for the client. */
function isPendingState(value: unknown): value is CollabPendingState {
  if (!value || typeof value !== 'object') {
    return false
  }
  const state = value as Record<string, unknown>
  const confirmed = state.confirmed
  if (!Number.isSafeInteger(state.seq) || (state.seq as number) < 0 || !confirmed || typeof confirmed !== 'object') {
    return false
  }
  const snapshot = confirmed as Record<string, unknown>
  if (!Number.isSafeInteger(snapshot.version) || (snapshot.version as number) < 0 || !Array.isArray(snapshot.nodes)) {
    return false
  }
  const transaction = (candidate: unknown) => candidate === null || (!!candidate && typeof candidate === 'object'
    && typeof (candidate as Record<string, unknown>).docId === 'string'
    && typeof (candidate as Record<string, unknown>).clientId === 'string'
    && Number.isSafeInteger((candidate as Record<string, unknown>).seq)
    && Number.isSafeInteger((candidate as Record<string, unknown>).baseVersion)
    && Array.isArray((candidate as Record<string, unknown>).ops))
  return transaction(state.inflight) && (state.buffer === null || Array.isArray(state.buffer))
}

/** Persists (or clears, for `null`) the pending state of a client. */
export async function savePendingState(storage: KeyValueStorage, docId: string, state: CollabPendingState | null, options: PendingStateStorageOptions = {}): Promise<void> {
  if (state) {
    await storage.set(pendingKey(docId, options), structuredClone(state))
  }
  else {
    await clearPendingState(storage, docId, options)
  }
}

/** Loads a persisted pending state, to pass as `createCollabClient({ restore })`. */
export async function loadPendingState(storage: KeyValueStorage, docId: string, options: PendingStateStorageOptions = {}): Promise<CollabPendingState | null> {
  const key = pendingKey(docId, options)
  const state = await storage.get(key)
  if (state === undefined || state === null) {
    return null
  }
  if (!isPendingState(state)) {
    await storage.delete(key)
    return null
  }
  return structuredClone(state)
}

/** Deletes private pending edits on logout, revocation or document disposal. */
export async function clearPendingState(storage: KeyValueStorage, docId: string, options: PendingStateStorageOptions = {}): Promise<void> {
  await storage.delete(pendingKey(docId, options))
}

/** Result of `rebaseOnSnapshot`. */
export interface SnapshotRebaseResult {
  /** Ops to apply on the snapshot to bring the local edits back. */
  ops: DocOp[]
  conflicts: CollabConflict[]
}

/** Records equal apart from the server version. */
function sameNode(a: DocNodeRecord, b: DocNodeRecord): boolean {
  return fieldValuesEqual({ ...a, version: 0 }, { ...b, version: 0 })
}

/** Local nodes created offline, parents first so inserts apply in order. */
function newNodesInOrder(base: DocState, local: DocState): DocNodeRecord[] {
  const created = [...local.nodes.values()].filter(node => !base.nodes.has(node.id) && !node.deleted)
  const ids = new Set(created.map(node => node.id))
  const depth = (node: DocNodeRecord): number => node.parentId && ids.has(node.parentId) ? 1 + depth(local.nodes.get(node.parentId)!) : 0
  return created.sort((a, b) => depth(a) - depth(b))
}

/**
 * Fallback when offline edits are older than the op log retention and can
 * no longer be transformed: rebuilds them per node on top of the server
 * snapshot. Text is merged three ways (persisted base, local, server) with
 * marks re-applied; when text edits overlap, the local version is inserted
 * as a conflict copy right after the original (`attrs.conflictOf`), so no
 * text is lost. New, deleted, moved and re-attributed nodes are replayed
 * when they still apply.
 *
 * @param base Confirmed state the pending ops were based on.
 * @param local Local state (base plus pending ops).
 * @param snapshot Current server state.
 * @param copyIdPrefix Suffix of conflict copy ids (`<id>~<prefix>`).
 * @param pending The pending ops (`base` to `local`): they tell which local
 * characters are base characters, so equal characters of other users are
 * never re-labelled. Without them a text diff decides.
 */
export function rebaseOnSnapshot(base: DocState, local: DocState, snapshot: DocState, copyIdPrefix = 'conflict', pending?: DocOp[]): SnapshotRebaseResult {
  const scratch = cloneDocState(snapshot)
  const ops: DocOp[] = []
  const conflicts: CollabConflict[] = []
  /** An id not used by the snapshot yet. */
  const freeId = (id: string) => {
    let candidate = id
    for (let n = 2; scratch.nodes.has(candidate); n++) {
      candidate = `${id}${n}`
    }
    return candidate
  }
  /** Keeps an op only if it applies on top of the previous ones. */
  const push = (op: DocOp) => {
    try {
      applyDocOps(scratch, [op])
      ops.push(op)
      return true
    }
    catch {
      return false
    }
  }

  for (const node of newNodesInOrder(base, local)) {
    if (!scratch.nodes.has(node.id)) {
      const parentId = node.parentId && scratch.nodes.has(node.parentId) ? node.parentId : null
      push({ t: 'insertNode', node: { id: node.id, parentId, orderKey: node.orderKey, type: node.type, attrs: node.attrs, content: node.content } })
    }
  }

  for (const original of base.nodes.values()) {
    const mine = local.nodes.get(original.id)
    const theirs = scratch.nodes.get(original.id)
    if (!mine || sameNode(mine, original)) {
      continue
    }
    if (!theirs) {
      // Gone from the server (GC): bring back the local version.
      if (!mine.deleted) {
        push({ t: 'insertNode', node: { id: mine.id, parentId: null, orderKey: mine.orderKey, type: mine.type, attrs: mine.attrs, content: mine.content } })
      }
      continue
    }
    if (mine.content && theirs.content && !fieldValuesEqual(mine.content, original.content)) {
      const textOps = pending && original.content ? pendingTextOps(pending, original.id) : null
      const origins = textOps && textUnitOrigins(deltaLength(original.content!), textOps)
      const merged = theirs.deleted && !mine.deleted ? null : mergeContent(original.content ?? [], mine.content, theirs.content, origins)
      const applied = merged?.status === 'merged' && push({ t: 'text', node: theirs.id, ops: merged.ops })
      if (!applied) {
        // Overlapping edits, or text typed in a node the server deleted:
        // keep the local version visible next to the original.
        const copyId = freeId(`${theirs.id}~${copyIdPrefix}`)
        const siblings = orderedChildren(scratch, theirs.parentId, { includeDeleted: true })
        const next = siblings[siblings.findIndex(sibling => sibling.id === theirs.id) + 1]
        const orderKey = tryGenerateOrderKey(theirs.orderKey, next?.orderKey ?? null) ?? theirs.orderKey
        if (push({ t: 'insertNode', node: { id: copyId, parentId: theirs.parentId, orderKey, type: mine.type, attrs: { ...mine.attrs, conflictOf: theirs.id }, content: mine.content } })) {
          conflicts.push({ nodeId: theirs.id, copyId })
        }
      }
    }
    if (mine.type !== original.type) {
      push({ t: 'setType', node: theirs.id, type: mine.type })
    }
    for (const key of new Set([...Object.keys(mine.attrs), ...Object.keys(original.attrs)])) {
      if (!fieldValuesEqual(mine.attrs[key], original.attrs[key])) {
        push({ t: 'setAttrs', node: theirs.id, attrs: { [key]: mine.attrs[key] ?? null } })
      }
    }
    if (mine.parentId !== original.parentId || mine.orderKey !== original.orderKey) {
      push({ t: 'moveNode', node: theirs.id, parentId: mine.parentId, orderKey: mine.orderKey })
    }
    if (mine.deleted !== original.deleted && mine.deleted !== theirs.deleted) {
      // Delete only what the server did not change meanwhile; always restore.
      const untouched = fieldValuesEqual(theirs.content, original.content) && fieldValuesEqual(theirs.attrs, original.attrs)
      if (!mine.deleted || untouched) {
        push({ t: mine.deleted ? 'deleteNode' : 'restoreNode', node: theirs.id })
      }
    }
  }
  return { ops, conflicts }
}

/**
 * Forgets nodes of `local` that only rejected ops created: undoing their
 * creation hid them, but the server never had them. Nodes created by the
 * remaining pending ops stay.
 */
export function pruneUnconfirmedNodes(local: DocState, confirmed: DocState, pending: DocOp[]): void {
  const created = new Set<string>()
  for (const op of pending) {
    if (op.t === 'insertNode') {
      created.add(op.node.id)
    }
    else if (op.t === 'splitNode') {
      created.add(op.newNode)
    }
  }
  for (const id of [...local.nodes.keys()]) {
    if (!confirmed.nodes.has(id) && !created.has(id)) {
      local.nodes.delete(id)
    }
  }
}
