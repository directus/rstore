/**
 * `@rstore/multiplayer/ot` (experimental, spike X1): server-ordered rich-text
 * operational transformation for documents stored as block-node records.
 *
 * - Inline content is a Delta (Quill/ShareDB `rich-text`): text and length-1
 *   embeds with marks as attributes. Offsets are UTF-16 code units; ops that
 *   split a surrogate pair are rejected.
 * - Structure ops address nodes by id: insert, soft delete/restore, move,
 *   attributes, split and merge.
 * - A central sequencer orders transactions (Jupiter model), so transforms
 *   only need TP1. Insert ties: the first sequenced op goes first; format and
 *   attribute conflicts: the later sequenced op wins.
 *
 * @module
 */
export * from './authoring.js'
export * from './client.js'
export * from './composition.js'
export * from './delta/index.js'
export * from './doc/index.js'
export * from './errors.js'
export { defaultMarkExpandPolicy } from './marks.js'
export { generateOrderKey, generateOrderKeys, isValidOrderKey } from './orderKey.js'
export { clearPendingState, loadPendingState, rebaseOnSnapshot, savePendingState } from './pending.js'
export type { KeyValueStorage, PendingStateStorageOptions, SnapshotRebaseResult } from './pending.js'
export * from './types.js'
export * from './undo.js'
