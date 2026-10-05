/**
 * `@rstore/multiplayer/server`: transport-agnostic server helpers, free of
 * Node imports. Adapters (Nitro, Durable Objects…) own the sockets.
 *
 * Rooms for `multiplayer:*` frames (presence, cursors, form updates):
 *
 * - {@link createMultiplayerServer}: the frame pipeline (size and rate
 *   limits, validation, `multiplayer.authorize` once per room, identity
 *   binding, `multiplayer.filter`, broadcast, leave on close).
 * - {@link createMultiplayerServerHooks}: the hook registry it calls.
 * - {@link isOriginAllowed}: WebSocket upgrade origin policy.
 * - Building blocks: {@link RoomRegistry}, {@link PeerIdentityStore},
 *   {@link PeerRateLimiter}.
 *
 * Rich-text OT sequencer (experimental, spike X1):
 *
 * - {@link sequenceTransaction}: stateless sequencing of one transaction on
 *   a pluggable {@link OpLogStore} (dedupe by `(clientId, seq)`, rebase,
 *   permission check per op, compare-and-set append).
 * - {@link createCollabServer}: `collab:*` frame handling for connected
 *   peers (hello/catch-up/snapshot, acks, broadcasts with per-peer
 *   redaction and version-only frames) plus `submitServer` for
 *   server-authored ops.
 * - {@link createMemoryOpLogStore}: in-memory store with retention.
 *
 * @module
 */
export * from './collabServer.js'
export * from './hooks.js'
export * from './identity.js'
export * from './oplog.js'
export * from './origin.js'
export * from './rateLimit.js'
export * from './rooms.js'
export * from './sequence.js'
export * from './server.js'
