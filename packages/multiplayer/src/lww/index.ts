/**
 * `@rstore/multiplayer/lww`: field-level last-writer-wins merge and delete
 * tombstones, ordered by `@rstore/multiplayer/clock` timestamps.
 *
 * These are pure functions over plain objects. Cache integration (merging
 * stamped writes, recording tombstones) is done by the multiplayer cache plugin.
 *
 * @module
 */
export * from './fields.js'
export * from './policies.js'
export * from './tombstone.js'
export * from './types.js'
