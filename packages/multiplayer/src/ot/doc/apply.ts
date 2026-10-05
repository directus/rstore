import type { Delta, DocNodeRecord, DocOp, DocState, NewDocNode } from '../types.js'
import { applyTextOp, splitsSurrogatePair } from '../delta/apply.js'
import { deltaLength, deltaToPlainText } from '../delta/builder.js'
import { concatDelta, sliceDelta } from '../delta/slice.js'
import { OtValidationError } from '../errors.js'
import { isValidOrderKey } from '../orderKey.js'

/** Maximum length of a node id. */
const MAX_ID_LENGTH = 128

/** Reads through pending writes to the committed nodes, so a failing op list leaves the state untouched. */
class NodeOverlay {
  readonly writes = new Map<string, DocNodeRecord>()

  constructor(private readonly state: DocState) {}

  get(id: string): DocNodeRecord | undefined {
    return this.writes.get(id) ?? this.state.nodes.get(id)
  }

  /** The node, or a validation error naming the op. */
  require(id: string, op: DocOp): DocNodeRecord {
    const node = typeof id === 'string' ? this.get(id) : undefined
    if (!node) {
      throw new OtValidationError(`${op.t}: unknown node ${String(id)}`)
    }
    return node
  }

  /** The textblock content of a node, or a validation error. */
  content(node: DocNodeRecord, op: DocOp): Delta {
    if (node.content === null) {
      throw new OtValidationError(`${op.t}: node ${node.id} is not a textblock`)
    }
    return node.content
  }

  set(node: DocNodeRecord): void {
    this.writes.set(node.id, node)
  }
}

/** Throws unless `value` is a usable node id. */
function checkId(value: unknown, what: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) {
    throw new OtValidationError(`${what} must be a non-empty id of at most ${MAX_ID_LENGTH} characters`)
  }
}

/** Throws unless the parent exists and placing `id` under it creates no cycle. */
function checkParent(nodes: NodeOverlay, id: string, parentId: unknown, orderKey: unknown): void {
  if (!isValidOrderKey(orderKey)) {
    throw new OtValidationError(`invalid order key ${String(orderKey)}`)
  }
  if (parentId === null) {
    return
  }
  checkId(parentId, 'parentId')
  for (let current = nodes.get(parentId), depth = 0; current; depth++) {
    if (current.id === id || depth > 10_000) {
      throw new OtValidationError(`moving ${id} under ${parentId} creates a cycle`, 'cycle')
    }
    current = current.parentId === null ? undefined : nodes.get(current.parentId)
  }
  if (!nodes.get(parentId)) {
    throw new OtValidationError(`unknown parent ${parentId}`)
  }
}

/** Throws unless `value` is a plain attribute object. */
function checkAttrs(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OtValidationError('attrs must be an object')
  }
}

/** Validated textblock content of a new node (`null` for containers). */
function newContent(node: NewDocNode): Delta | null {
  if (node.content === null) {
    return null
  }
  if (!Array.isArray(node.content) || node.content.some(run => !run || typeof run !== 'object' || !('insert' in run))) {
    throw new OtValidationError('content must be a Delta of inserts')
  }
  return applyTextOp([], node.content)
}

/** Applies one op through the overlay. */
function applyOne(nodes: NodeOverlay, op: DocOp, docId: string): void {
  switch (op.t) {
    case 'text': {
      const node = nodes.require(op.node, op)
      nodes.set({ ...node, content: applyTextOp(nodes.content(node, op), op.ops) })
      return
    }
    case 'insertNode': {
      const node = op.node
      checkId(node?.id, 'node id')
      if (nodes.get(node.id)) {
        throw new OtValidationError(`insertNode: node ${node.id} already exists`)
      }
      if (typeof node.type !== 'string' || !node.type) {
        throw new OtValidationError('insertNode: type must be a string')
      }
      checkAttrs(node.attrs)
      checkParent(nodes, node.id, node.parentId, node.orderKey)
      nodes.set({ id: node.id, docId, parentId: node.parentId, orderKey: node.orderKey, type: node.type, attrs: node.attrs, content: newContent(node), deleted: false, version: 0 })
      return
    }
    case 'deleteNode':
    case 'restoreNode': {
      const node = nodes.require(op.node, op)
      nodes.set({ ...node, deleted: op.t === 'deleteNode' })
      return
    }
    case 'moveNode': {
      const node = nodes.require(op.node, op)
      checkParent(nodes, node.id, op.parentId, op.orderKey)
      nodes.set({ ...node, parentId: op.parentId, orderKey: op.orderKey })
      return
    }
    case 'setAttrs': {
      const node = nodes.require(op.node, op)
      checkAttrs(op.attrs)
      const attrs = { ...node.attrs }
      for (const key in op.attrs) {
        if (op.attrs[key] === null) {
          delete attrs[key]
        }
        else {
          attrs[key] = op.attrs[key]
        }
      }
      nodes.set({ ...node, attrs })
      return
    }
    case 'setType': {
      const node = nodes.require(op.node, op)
      if (typeof op.type !== 'string' || !op.type) {
        throw new OtValidationError('setType: type must be a string')
      }
      nodes.set({ ...node, type: op.type })
      return
    }
    case 'splitNode':
      applySplit(nodes, op, docId)
      return
    case 'mergeNode': {
      const node = nodes.require(op.node, op)
      const into = nodes.require(op.into, op)
      const intoContent = nodes.content(into, op)
      if (node.id === into.id || op.at !== deltaLength(intoContent)) {
        throw new OtValidationError(`mergeNode: ${node.id} into ${into.id} at ${op.at} (length ${deltaLength(intoContent)})`)
      }
      nodes.set({ ...into, content: concatDelta(intoContent, nodes.content(node, op)) })
      nodes.set({ ...node, content: [], deleted: true })
      return
    }
    default:
      throw new OtValidationError(`unknown op ${String((op as { t?: unknown }).t)}`)
  }
}

/** Moves the tail of a textblock to a new (or revived deleted) sibling. */
function applySplit(nodes: NodeOverlay, op: Extract<DocOp, { t: 'splitNode' }>, docId: string): void {
  const node = nodes.require(op.node, op)
  const content = nodes.content(node, op)
  if (!Number.isInteger(op.at) || op.at < 0 || op.at > deltaLength(content) || splitsSurrogatePair(deltaToPlainText(content), op.at)) {
    throw new OtValidationError(`splitNode: invalid offset ${op.at}`)
  }
  checkId(op.newNode, 'newNode')
  const existing = nodes.get(op.newNode)
  if (existing && (!existing.deleted || existing.content === null || existing.id === node.id)) {
    throw new OtValidationError(`splitNode: node ${op.newNode} already exists`)
  }
  const type = op.newType ?? existing?.type ?? node.type
  const attrs = op.newAttrs ?? {}
  checkAttrs(attrs)
  checkParent(nodes, op.newNode, op.parentId, op.orderKey)
  nodes.set({ ...node, content: sliceDelta(content, 0, op.at) })
  nodes.set({
    id: op.newNode,
    docId,
    parentId: op.parentId,
    orderKey: op.orderKey,
    type,
    attrs,
    content: sliceDelta(content, op.at),
    deleted: false,
    version: existing?.version ?? 0,
  })
}

/** Options of `applyDocOps`. */
export interface ApplyDocOpsOptions {
  /** Stamp touched nodes and the state with this version (sequenced ops). */
  version?: number
}

/**
 * Applies ops to a document state, all or nothing: on a validation error
 * (`OtValidationError`) the state is left unchanged.
 *
 * @returns Ids of the nodes the ops created or changed.
 */
export function applyDocOps(state: DocState, ops: DocOp[], options: ApplyDocOpsOptions = {}): Set<string> {
  if (!Array.isArray(ops)) {
    throw new OtValidationError('ops must be an array')
  }
  const nodes = new NodeOverlay(state)
  for (const op of ops) {
    if (!op || typeof op !== 'object') {
      throw new OtValidationError('op must be an object')
    }
    applyOne(nodes, op, state.docId)
  }
  for (const [id, node] of nodes.writes) {
    state.nodes.set(id, options.version === undefined ? node : { ...node, version: options.version })
  }
  if (options.version !== undefined) {
    state.version = options.version
  }
  return new Set(nodes.writes.keys())
}

/**
 * Applies ops one by one, skipping those that no longer apply (a move that
 * now creates a cycle, an op on a node that is gone). Used to show pending
 * local ops whose validity depends on state the server will decide on.
 *
 * @returns `true` when every op applied.
 */
export function applyDocOpsLeniently(state: DocState, ops: DocOp[]): boolean {
  let complete = true
  for (const op of ops) {
    try {
      applyDocOps(state, [op])
    }
    catch (error) {
      if (!(error instanceof OtValidationError)) {
        throw error
      }
      complete = false
    }
  }
  return complete
}

/** Applies ops all or nothing; `false` (state unchanged) when they do not apply. */
export function tryApplyDocOps(state: DocState, ops: DocOp[]): boolean {
  try {
    applyDocOps(state, ops)
    return true
  }
  catch (error) {
    if (error instanceof OtValidationError) {
      return false
    }
    throw error
  }
}
