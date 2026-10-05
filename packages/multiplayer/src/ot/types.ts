/**
 * Mark (attribute) values of inline content. `null` only appears in format
 * operations, where it removes the mark.
 */
export type DeltaAttributes = Record<string, unknown>

/** Inline embed (mention, hard break, inline image): an object with one key, length 1. */
export type DeltaEmbed = Record<string, unknown>

/** One run of inline content: text or a length-1 embed, with its marks. */
export interface DeltaInsert {
  /** Text or a length-1 inline embed. */
  insert: string | DeltaEmbed
  /** Marks of this run. Never contains `null` values. */
  attributes?: DeltaAttributes
}

/**
 * Inline content of a textblock node, as Quill/ShareDB `rich-text` Deltas
 * made of inserts only. Lengths and offsets are UTF-16 code units; an embed
 * counts as 1.
 */
export type Delta = DeltaInsert[]

/** Keep `retain` units, optionally changing their marks (`null` removes a mark). */
export interface TextRetain {
  retain: number
  attributes?: Record<string, unknown | null>
}

/** Insert text or an embed with the given marks. */
export interface TextInsert {
  insert: string | DeltaEmbed
  attributes?: DeltaAttributes
}

/** Delete `delete` units. */
export interface TextDelete {
  delete: number
}

/** Delta operation component on one node's inline content. */
export type TextOpComponent = TextRetain | TextInsert | TextDelete

/**
 * A text operation: components walk the content from offset 0. A trailing
 * plain retain is implicit and always dropped by normalization.
 */
export type TextOp = TextOpComponent[]

/** One block node stored as an rstore record. */
export interface DocNodeRecord {
  /** Stable, client-generated (UUIDv7 recommended). */
  id: string
  docId: string
  parentId: string | null
  /** Fractional index among siblings; ties are broken by `id`. */
  orderKey: string
  /** ProseMirror node type name (changed by `setType`, e.g. paragraph to heading). */
  type: string
  attrs: Record<string, unknown>
  /** Inline content for textblocks; `null` for containers (lists, tables, blockquotes). */
  content: Delta | null
  /** Soft delete: kept until retention GC so concurrent ops and undo still resolve. */
  deleted: boolean
  /** Document version that last changed this node (set by the sequencer). */
  version: number
}

/** Fields of a node an `insertNode` operation provides. */
export type NewDocNode = Omit<DocNodeRecord, 'version' | 'deleted' | 'docId'>

/** Edit the inline content of a textblock. */
export interface TextDocOp { t: 'text', node: string, ops: TextOp }
/** Create a node. Its id must not exist yet. */
export interface InsertNodeDocOp { t: 'insertNode', node: NewDocNode }
/** Soft-delete a node (and hide its subtree). */
export interface DeleteNodeDocOp { t: 'deleteNode', node: string }
/** Undo a soft delete. */
export interface RestoreNodeDocOp { t: 'restoreNode', node: string }
/** Change the parent and/or position of a node. Concurrent moves: the later sequenced wins. */
export interface MoveNodeDocOp { t: 'moveNode', node: string, parentId: string | null, orderKey: string }
/** Set (or remove with `null`) node attributes. Per-key last-writer-wins by server order. */
export interface SetAttrsDocOp { t: 'setAttrs', node: string, attrs: Record<string, unknown | null> }
/** Change the node type, keeping its id (paragraph to heading). Last-writer-wins by server order. */
export interface SetTypeDocOp { t: 'setType', node: string, type: string }

/**
 * Move the inline content of `node` from offset `at` to a new sibling
 * `newNode` (or revive a deleted node with that id, as undo of a merge does).
 */
export interface SplitNodeDocOp {
  t: 'splitNode'
  node: string
  at: number
  newNode: string
  /** Parent of the new node, set by the author (usually the parent of `node`). */
  parentId: string | null
  orderKey: string
  /**
   * Type of the new node. Authoring helpers always set it: the default (the
   * type of `node` when applied) depends on concurrent `setType` ops.
   */
  newType?: string
  /** Attributes of the new node. Defaults to `{}`, never copied from `node`. */
  newAttrs?: Record<string, unknown>
  /**
   * Sibling keys around the insertion point when the op was authored
   * (`[key of node, key of its next sibling]`). Lets a concurrent split of
   * the same node be re-keyed so text order and sibling order agree.
   */
  keyRange?: [string | null, string | null]
}

/**
 * Append the inline content of `node` to `into` (which then has `at + length`
 * units) and soft-delete `node`. `at` is the length of `into` and is kept
 * exact by transforms.
 */
export interface MergeNodeDocOp { t: 'mergeNode', node: string, into: string, at: number }

/** Every op a transaction can contain. */
export type DocOp
  = | TextDocOp
    | InsertNodeDocOp
    | DeleteNodeDocOp
    | RestoreNodeDocOp
    | MoveNodeDocOp
    | SetAttrsDocOp
    | SetTypeDocOp
    | SplitNodeDocOp
    | MergeNodeDocOp

/** Atomic unit sent by a client and sequenced by the server. */
export interface DocTransaction {
  docId: string
  clientId: string
  /** Client-local sequence, used to match acks and deduplicate resubmits. */
  seq: number
  /** Server version the ops were authored against. */
  baseVersion: number
  ops: DocOp[]
}

/** In-memory document: the node records by id and the version they reflect. */
export interface DocState {
  docId: string
  version: number
  nodes: Map<string, DocNodeRecord>
}

/**
 * Decides, per mark key, whether text inserted strictly inside a range a
 * concurrent operation formats takes that formatting (Peritext anomaly
 * mitigation). Server and clients must use the same policy.
 */
export type MarkExpandPolicy = (key: string) => boolean

/** Options shared by every transform (server and clients must agree). */
export interface TransformOptions {
  /** @default defaultMarkExpandPolicy (bold, italic, code) */
  expand?: MarkExpandPolicy
}
