import type { MultiplayerPeer } from './types.js'
import { isMultiplayerId, isMultiplayerTextCursor, isMultiplayerUser } from '../protocol/guards.js'

/**
 * Full-shape validator for a peer entry: a valid user plus a bounded
 * `clientId`, a finite `lastSeen`, a string field and a valid cursor.
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

/** Delete peers whose last frame is older than `staleMs`. Returns whether any was deleted. */
export function evictStalePeers(peers: Map<string, MultiplayerPeer<any>>, now: number, staleMs: number): boolean {
  let evicted = false
  for (const [clientId, peer] of peers) {
    if (now - peer.lastSeen > staleMs) {
      peers.delete(clientId)
      evicted = true
    }
  }
  return evicted
}

/**
 * Collapse connections by user id for display: a user active in several tabs
 * is represented by their most recently seen connection.
 */
export function aggregatePeersByUser<TField extends string>(peers: Iterable<MultiplayerPeer<TField>>): MultiplayerPeer<TField>[] {
  const byUser = new Map<string, MultiplayerPeer<TField>>()
  for (const peer of peers) {
    const existing = byUser.get(peer.id)
    if (!existing || peer.lastSeen > existing.lastSeen) {
      byUser.set(peer.id, peer)
    }
  }
  return Array.from(byUser.values())
}
