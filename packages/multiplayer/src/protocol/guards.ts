import type { MultiplayerMessage, MultiplayerTextCursor, MultiplayerTypingTarget, MultiplayerUser, ParseMultiplayerMessageOptions } from './types.js'
import { isRecord } from './record.js'

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

/** Keys allowed on a `multiplayer:typing` frame and on its target. */
const TYPING_KEYS = new Set(['type', 'roomId', 'clientId', 'userId', 'target'])
const TYPING_TARGET_KEYS = new Set(['collection', 'key', 'field'])

/** Returns whether every own key of `value` is in `allowed`. */
function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key))
}

/** Returns whether a value is a typing target: a record reference and an optional field, nothing else. */
function isMultiplayerTypingTarget(value: unknown): value is MultiplayerTypingTarget {
  return isRecord(value)
    && hasOnlyKeys(value, TYPING_TARGET_KEYS)
    && isMultiplayerId(value.collection)
    && (isMultiplayerId(value.key) || (typeof value.key === 'number' && Number.isFinite(value.key)))
    && (value.field === undefined || isMultiplayerId(value.field))
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
    case 'multiplayer:typing':
      // Exact shape: a typing frame must never smuggle typed content.
      return hasOnlyKeys(value, TYPING_KEYS)
        && isMultiplayerId(value.userId)
        && (value.target === null || isMultiplayerTypingTarget(value.target))
    default:
      return false
  }
}

/**
 * Parse and validate a raw multiplayer WebSocket payload without throwing.
 *
 * Returns `null` for anything that is not a JSON string or not a valid frame.
 * `options.onInvalid` receives the parsed value of JSON frames that fail
 * structural validation (a misbehaving peer), not transport noise such as
 * non-JSON text or binary payloads.
 *
 * @param raw Payload as received from the transport.
 * @param options Diagnostics hooks.
 */
export function parseMultiplayerMessage<TUpdate = Record<string, any>, TField extends string = string>(
  raw: unknown,
  options: ParseMultiplayerMessageOptions = {},
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
    options.onInvalid?.(parsed)
    return null
  }
  return parsed
}
