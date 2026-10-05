import { createMultiplayerPlugin } from '@rstore/multiplayer'

/**
 * Multiplayer cache semantics for the collaboration demos: the form text
 * merger keeps concurrent non-overlapping edits on `$rebase`, and `DocNode`
 * rows (collab document blocks) are ordered by their version.
 */
export default createMultiplayerPlugin({ ot: { collections: ['DocNode'] } })
