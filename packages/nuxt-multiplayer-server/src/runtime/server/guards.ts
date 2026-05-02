import type { MultiplayerMessage, MultiplayerTextCursor, MultiplayerUser } from './types'

/** Absolute ceiling on cursor positions accepted from a peer. */
const MAX_CURSOR_POSITION = 1e7

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
  return typeof value.id === 'string'
    && value.id.length > 0
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
  switch (value.type) {
    case 'multiplayer:update':
      return typeof value.userId === 'string' && 'data' in value
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
      return typeof value.userId === 'string'
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
