/**
 * `@rstore/multiplayer/prosemirror` (experimental prototype, spike X1):
 * binds a ProseMirror editor to a `@rstore/multiplayer/ot` collab client.
 * `prosemirror-model`, `prosemirror-state`, `prosemirror-transform` and
 * `prosemirror-view` are optional peer dependencies.
 *
 * - {@link collabPlugin}: local transactions become ops (Enter/Backspace at
 *   block boundaries become splits/merges), remote ops become steps, IME
 *   compositions are held and sent as one transaction.
 * - {@link withNodeIds}: adds the `id` attribute block nodes need.
 * - {@link docStateToNode} / {@link diffDocument}: conversions, usable
 *   without a view (server-side rendering, tests).
 *
 * @module
 */
export { rebuildTransaction, remoteTransaction } from './apply.js'
export { attributesToMarks, deltaToInline, docStateToNode, flattenBlocks, marksToAttributes, NODE_ID_ATTR, textblockToDelta } from './convert.js'
export type { FlatBlock } from './convert.js'
export { diffDocument } from './diff.js'
export type { DiffDocumentOptions } from './diff.js'
export { collabPlugin, collabPluginKey, collabRedo, collabUndo } from './plugin.js'
export type { CollabPluginOptions } from './plugin.js'
export { withNodeIds } from './schema.js'
