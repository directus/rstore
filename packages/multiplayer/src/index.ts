/**
 * `@rstore/multiplayer`: framework-agnostic multiplayer building blocks for
 * rstore. It depends only on `@rstore/shared`, never on `@rstore/core`, Vue or
 * Nuxt, and every concern has its own tree-shakable entry:
 *
 * | Entry | Content |
 * | --- | --- |
 * | `@rstore/multiplayer/clock` | Hybrid Logical Clock timestamps |
 * | `@rstore/multiplayer/lww` | Field last-writer-wins merge and delete tombstones |
 * | `@rstore/multiplayer/text` | Text diff, three-way merge and cursor rebasing |
 * | `@rstore/multiplayer/protocol` | Wire frame types, guards and sanitization |
 * | `@rstore/multiplayer/ot` | Rich-text OT for block-node documents: ops, transforms, client, undo, IME guard (experimental) |
 * | `@rstore/multiplayer/server` | Transport-agnostic servers, including the OT sequencer and op log |
 * | `@rstore/multiplayer/prosemirror` | ProseMirror binding of the OT client (experimental, optional peers) |
 *
 * The root entry provides `createMultiplayerPlugin()`, the cache plugin that
 * applies field LWW and tombstones through the core cache extension points,
 * with its store helpers, and re-exports the public types of every subpath.
 *
 * @module
 */
export type * from './clock/index.js'
export type * from './lww/index.js'
export type * from './ot/index.js'
// Explicit names: the store-level `gcTombstones` shadows the `/lww` one, which
// takes a `TombstoneStore` and stays available from `@rstore/multiplayer/lww`.
export {
  bindCollabCache,
  createMultiplayerPlugin,
  FIELD_TIMESTAMPS_NAMESPACE,
  gcTombstones,
  getFieldTimestamps,
  getTombstone,
  OT_NAMESPACE,
  setFieldTimestamps,
  textFieldMerger,
  TOMBSTONE_NAMESPACE,
  tombstoneEntries,
} from './plugin/index.js'
export type { CollabCacheBindingOptions, CollabCacheStoreLike, MultiplayerPluginOptions, MultiplayerStoreLike, MultiplayerWriteMetadata, OtItemMetadata, TombstoneGcOptions } from './plugin/index.js'
export type * from './protocol/index.js'
export type * from './text/index.js'
