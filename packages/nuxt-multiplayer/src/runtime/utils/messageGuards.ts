import type { MultiplayerMessage, MultiplayerPeer } from '../types'
import {
  isMultiplayerId,
  isMultiplayerMessage,
  isMultiplayerTextCursor,
  isMultiplayerUser,
} from '@rstore/shared'

export {
  isMultiplayerId,
  isMultiplayerMessage,
  isMultiplayerTextCursor,
  isMultiplayerUser,
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
  if (!isMultiplayerId(peer.clientId)) {
    return false
  }
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

/**
 * Parses a raw WebSocket payload into a typed `MultiplayerMessage`. Returns
 * `null` if the payload is non-JSON, non-object, or fails structural
 * validation. In non-production builds, invalid payloads trigger a
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
