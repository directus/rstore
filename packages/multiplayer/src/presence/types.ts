import type { MultiplayerTextCursor, MultiplayerTypingTarget, MultiplayerUser } from '../protocol/types.js'

/** A remote connection in a room, as known from its presence frames. */
export interface MultiplayerPeer<TField extends string = string> extends MultiplayerUser {
  /**
   * Connection-scoped id (one per channel instance / browser tab). Two
   * tabs of the same user appear as two peers sharing the same `id`.
   */
  clientId: string
  field?: TField | null
  cursor?: MultiplayerTextCursor | null
  /** `now()` of the last frame received from this connection. */
  lastSeen: number
}

/** A remote connection currently typing. */
export interface MultiplayerTypingPeer {
  clientId: string
  userId: string
  target: MultiplayerTypingTarget
}

/**
 * Text transport of a presence channel (a WebSocket, a BroadcastChannel…).
 * Incoming frames are passed to `channel.receive()`, and each (re)connection
 * is announced with `channel.handleOpen()`.
 */
export interface PresenceTransport {
  /** Send one serialized frame. */
  send: (text: string) => void
  /** Whether frames can be sent now; heartbeats are skipped otherwise. @default always open */
  isOpen?: () => boolean
}

/** Options of `createPresenceChannel`. */
export interface PresenceChannelOptions {
  roomId: string
  transport: PresenceTransport
  /** Local user; missing parts are generated (see `createMultiplayerUser`). */
  user?: Partial<MultiplayerUser>
  /** Palette for a generated user color. */
  colors?: readonly string[]
  /** Connection id. @default crypto.randomUUID() */
  clientId?: string
  /** Presence heartbeat period while the transport is open. @default 5000 */
  heartbeatMs?: number
  /** A peer without frames for this long is dropped. @default 15000 */
  staleMs?: number
  /** Period of the stale-peer sweep. @default 5000 */
  sweepMs?: number
  /** A remote typing indicator expires this long after its last frame. @default 3000 */
  typingTimeoutMs?: number
  /** Minimum delay between two identical local typing frames. @default 1000 */
  typingThrottleMs?: number
  /** Clock used for `lastSeen` and typing throttling. @default Date.now */
  now?: () => number
  /** Called with the parsed value of a structurally invalid frame. */
  onInvalidMessage?: (value: unknown) => void
}

/** Snapshot of a presence channel, replaced on every change. */
export interface PresenceChannelState<TField extends string = string> {
  /** One entry per remote connection. */
  peers: MultiplayerPeer<TField>[]
  /** One entry per remote user: their most recently seen connection. */
  users: MultiplayerPeer<TField>[]
  /** Remote connections currently typing. */
  typing: MultiplayerTypingPeer[]
}
