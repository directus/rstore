import type { MultiplayerMessage, MultiplayerTextCursor, MultiplayerUser } from '../types/multiplayer.js'

/** Absolute ceiling for cursor positions accepted from a peer. */
const MAX_CURSOR_POSITION = 1e7

/** Maximum length for user and connection ids accepted from a peer. */
const MAX_ID_LENGTH = 128

/** Directions supported by `MultiplayerTextCursor`. */
const CURSOR_DIRECTIONS = new Set<MultiplayerTextCursor['direction']>([
  'forward',
  'backward',
  'none',
])

/** Returns whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Returns whether a value is a non-empty, bounded multiplayer id. */
export function isMultiplayerId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

/** Returns whether a value is a finite cursor position within protocol bounds. */
function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= MAX_CURSOR_POSITION
    && Number.isInteger(value)
}

/** Returns whether a value is a structurally valid text cursor frame value. */
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
  return typeof value.direction === 'string'
    && CURSOR_DIRECTIONS.has(value.direction as MultiplayerTextCursor['direction'])
}

/** Returns whether a value has the public user shape allowed on the wire. */
export function isMultiplayerUser(value: unknown): value is MultiplayerUser {
  return isRecord(value)
    && isMultiplayerId(value.id)
    && typeof value.name === 'string'
    && typeof value.color === 'string'
}

/** Returns whether a value is one of the valid multiplayer wire frames. */
export function isMultiplayerMessage<TUpdate = Record<string, any>, TField extends string = string>(
  value: unknown,
): value is MultiplayerMessage<TUpdate, TField> {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.roomId !== 'string' || !isMultiplayerId(value.clientId)) {
    return false
  }

  switch (value.type) {
    case 'multiplayer:update':
      return isMultiplayerId(value.userId) && isRecord(value.data)
    case 'multiplayer:presence':
      return isMultiplayerUser(value.user)
        && (value.field == null || typeof value.field === 'string')
        && (value.cursor == null || isMultiplayerTextCursor(value.cursor))
    case 'multiplayer:leave':
      return isMultiplayerId(value.userId)
    default:
      return false
  }
}

/** Parses and validates a raw multiplayer WebSocket payload without throwing. */
export function parseMultiplayerMessage<TUpdate = Record<string, any>, TField extends string = string>(
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

  return isMultiplayerMessage<TUpdate, TField>(parsed) ? parsed : null
}
