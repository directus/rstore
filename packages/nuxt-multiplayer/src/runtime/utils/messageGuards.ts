import type {
  MultiplayerMessage,
  MultiplayerPeer,
  MultiplayerTextCursor,
  MultiplayerUser,
} from '../types'

/**
 * Upper bound on cursor positions we will accept. Absurdly large text
 * buffers are rejected here to keep a malicious peer from setting
 * positions near `Number.MAX_SAFE_INTEGER` and tripping subsequent math.
 */
const MAX_CURSOR_POSITION = 1e7

/** Allowed directions on the wire — must match `MultiplayerTextCursor`. */
const CURSOR_DIRECTIONS = new Set<MultiplayerTextCursor['direction']>([
  'forward',
  'backward',
  'none',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= MAX_CURSOR_POSITION
    && Number.isInteger(value)
}

/**
 * True when `value` is a structurally valid `MultiplayerTextCursor`.
 * Rejects non-finite, negative, or out-of-range positions and invalid
 * direction enums.
 */
export function isMultiplayerTextCursor(value: unknown): value is MultiplayerTextCursor {
  if (!isRecord(value)) {
    return false
  }
  if (!isFiniteNonNegativeInt(value.start) || !isFiniteNonNegativeInt(value.end)) {
    return false
  }
  if (value.start > value.end) {
    return false
  }
  if (typeof value.direction !== 'string' || !CURSOR_DIRECTIONS.has(value.direction as MultiplayerTextCursor['direction'])) {
    return false
  }
  return true
}

/**
 * True when `value` is a structurally valid `MultiplayerUser` — validates
 * `id`, `name`, and `color` strings.
 */
export function isMultiplayerUser(value: unknown): value is MultiplayerUser {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && typeof value.color === 'string'
}

/**
 * Full-shape validator for a peer entry. Stricter than the id-only guard
 * historically used in `peers.filter(...)` — catches peers missing
 * `lastSeen` or with a malformed cursor.
 */
export function isMultiplayerPeerStrict<TField extends string = string>(value: unknown): value is MultiplayerPeer<TField> {
  if (!isMultiplayerUser(value)) {
    return false
  }
  const peer = value as MultiplayerPeer<TField>
  if (typeof peer.lastSeen !== 'number' || !Number.isFinite(peer.lastSeen)) {
    return false
  }
  if (peer.field != null && typeof peer.field !== 'string') {
    return false
  }
  if (peer.cursor != null && !isMultiplayerTextCursor(peer.cursor)) {
    return false
  }
  return true
}

function isUpdateMessage(msg: Record<string, unknown>): boolean {
  return msg.type === 'multiplayer:update'
    && typeof msg.roomId === 'string'
    && typeof msg.userId === 'string'
    && 'data' in msg
}

function isPresenceMessage(msg: Record<string, unknown>): boolean {
  if (msg.type !== 'multiplayer:presence') {
    return false
  }
  if (typeof msg.roomId !== 'string') {
    return false
  }
  if (!isMultiplayerUser(msg.user)) {
    return false
  }
  if (msg.field != null && typeof msg.field !== 'string') {
    return false
  }
  if (msg.cursor != null && !isMultiplayerTextCursor(msg.cursor)) {
    return false
  }
  return true
}

function isLeaveMessage(msg: Record<string, unknown>): boolean {
  return msg.type === 'multiplayer:leave'
    && typeof msg.roomId === 'string'
    && typeof msg.userId === 'string'
}

/**
 * Narrowed discriminated-union guard for an inbound message.
 */
export function isMultiplayerMessage<TUpdate = Record<string, any>, TField extends string = string>(
  value: unknown,
): value is MultiplayerMessage<TUpdate, TField> {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }
  switch (value.type) {
    case 'multiplayer:update':
      return isUpdateMessage(value)
    case 'multiplayer:presence':
      return isPresenceMessage(value)
    case 'multiplayer:leave':
      return isLeaveMessage(value)
    default:
      return false
  }
}

/**
 * Parses a raw WebSocket payload into a typed `MultiplayerMessage`. Returns
 * `null` if the payload is non-JSON, non-object, or fails structural
 * validation. In dev builds (`import.meta.dev`), invalid payloads trigger a
 * single `console.warn` so misbehaving peers are surfaced.
 */
export function validateMultiplayerMessage<TUpdate = Record<string, any>, TField extends string = string>(
  raw: unknown,
): MultiplayerMessage<TUpdate, TField> | null {
  if (typeof raw !== 'string') {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!isMultiplayerMessage<TUpdate, TField>(parsed)) {
    // eslint-disable-next-line node/prefer-global/process
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn('[rstore-multiplayer] Dropped invalid message:', parsed)
    }
    return null
  }
  return parsed
}
