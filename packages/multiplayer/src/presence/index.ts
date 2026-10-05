/**
 * `@rstore/multiplayer/presence`: framework-agnostic presence for a room.
 *
 * - {@link createPresenceChannel}: heartbeats, peers with stale eviction and
 *   per-user aggregation, focused field and text cursor, typing indicators
 *   and state updates over any text transport. Its state is read with
 *   `getState()`/`subscribe()`, so UI layers wrap it in their own reactivity.
 * - {@link rebaseMultiplayerTextCursor}: keep a cursor in place over a text
 *   change of its field.
 * - {@link createMultiplayerUser}: complete a partial user (id, name, color).
 * - {@link isMultiplayerPeerStrict}: full-shape peer validation.
 *
 * Typing frames (`multiplayer:typing`) carry a record target, never content.
 *
 * @module
 */
export * from './channel.js'
export * from './cursor.js'
export { isMultiplayerPeerStrict } from './peers.js'
export * from './types.js'
export { isSameTypingTarget } from './typing.js'
export * from './user.js'
