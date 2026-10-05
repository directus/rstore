/**
 * `@rstore/multiplayer/protocol`: transport-agnostic multiplayer wire frames.
 *
 * Frames are JSON objects with a `type` discriminant (`'<channel>:<kind>'`,
 * e.g. `'multiplayer:update'`), the `roomId` they belong to and the
 * connection-scoped `clientId` of their sender. Everything received from a
 * peer is untrusted:
 *
 * - {@link parseMultiplayerMessage} turns raw transport text into a typed
 *   frame or `null`, never throwing; `onInvalid` surfaces bad peers.
 * - `isMultiplayer*` guards validate shapes and bounds (ids ≤ 128 chars,
 *   cursor offsets ≤ 1e7).
 * - {@link sanitizeMultiplayerUpdate} strips prototype-polluting keys and
 *   unknown fields before an update is merged into local state.
 *
 * Adding a frame family (for example the `collab:*` OT frames): define its
 * types in this folder, add a guard per frame next to the existing ones, and
 * keep `isMultiplayerMessage` limited to the frames its channel accepts.
 *
 * `collab:*` frames (rich-text OT, experimental) have their own guards
 * (`isCollabClientMessage`, `isCollabServerMessage`, `parseCollabMessage`)
 * and a negotiated version (`COLLAB_PROTOCOL_VERSION`, sent in
 * `collab:hello.protocols` and answered by `collab:welcome.protocol`).
 * Protocol 2 frames address a channel (`ch`) opened by the hello instead of
 * repeating ids; `toChannelFrame`/`fromChannelFrame` convert between both.
 *
 * @module
 */
export * from './collab.js'
export * from './collabChannel.js'
export * from './collabGuards.js'
export * from './guards.js'
export * from './sanitize.js'
export * from './types.js'
export * from './version.js'
