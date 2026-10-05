/**
 * `@rstore/multiplayer/text`: plain-text diff, three-way merge and cursor
 * rebasing.
 *
 * - {@link diffText} / {@link applyTextChanges}: change sets relative to an
 *   original string (`{ index, deleteCount, insertText }`).
 * - {@link mergeText}: state-based three-way merge used by form `$rebase`.
 * - {@link rebaseTextPosition} / {@link rebaseTextRange}: keep carets and
 *   peer cursors in place across edits.
 *
 * All offsets are UTF-16 code units, the unit of JS strings, DOM selections
 * and ProseMirror positions. The functions are pure and framework-agnostic;
 * rich-text OT (`/ot`, planned) builds on the same units.
 *
 * @module
 */
export * from './diff.js'
export * from './merge.js'
export * from './rebase.js'
export * from './types.js'
