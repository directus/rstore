import type { MultiplayerMessage, MultiplayerTextCursor, MultiplayerUser } from './types'

/** Absolute ceiling on cursor positions accepted from a peer. */
const MAX_CURSOR_POSITION = 1e7

/** Ceiling on id strings (userId / clientId) accepted from a peer. */
const MAX_ID_LENGTH = 128

const CURSOR_DIRECTIONS = new Set<MultiplayerTextCursor['direction']>([
  'forward',
  'backward',
  'none',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Non-empty bounded string — used for userId / clientId fields. */
function isIdString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= MAX_CURSOR_POSITION
    && Number.isInteger(value)
}

/**
 * Validates `MultiplayerTextCursor` — start/end finite integers, start ≤ end,
 * direction within the allowed enum.
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

/** Validates `MultiplayerUser` shape. */
export function isMultiplayerUser(value: unknown): value is MultiplayerUser {
  if (!isRecord(value)) {
    return false
  }
  return isIdString(value.id)
    && typeof value.name === 'string'
    && typeof value.color === 'string'
}

/**
 * Discriminated-union guard for an inbound peer message.
 */
export function isMultiplayerMessage<TUpdate = Record<string, any>, TField extends string = string>(
  value: unknown,
): value is MultiplayerMessage<TUpdate, TField> {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }
  if (typeof value.roomId !== 'string') {
    return false
  }
  // Every frame carries a connection-scoped clientId so peers can be
  // disambiguated across tabs of the same authenticated user.
  if (!isIdString(value.clientId)) {
    return false
  }
  switch (value.type) {
    case 'multiplayer:update':
      // `data` must be a plain JSON object — arrays, primitives and null
      // are rejected so downstream spreads always operate on records.
      return isIdString(value.userId) && isRecord(value.data)
    case 'multiplayer:presence': {
      if (!isMultiplayerUser(value.user)) {
        return false
      }
      if (value.field != null && typeof value.field !== 'string') {
        return false
      }
      if (value.cursor != null && !isMultiplayerTextCursor(value.cursor)) {
        return false
      }
      return true
    }
    case 'multiplayer:leave':
      return isIdString(value.userId)
    default:
      return false
  }
}

/**
 * Parse-and-validate entry point. Returns `null` for non-JSON or invalid
 * payloads. Never throws.
 */
export function parseMultiplayerMessage<TUpdate = Record<string, any>, TField extends string = string>(
  raw: unknown,
): MultiplayerMessage<TUpdate, TField> | null {
  let text: string
  if (typeof raw === 'string') {
    text = raw
  }
  else {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return null
  }

  return isMultiplayerMessage<TUpdate, TField>(parsed) ? parsed : null
}
