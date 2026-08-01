import type { MultiplayerMessage } from './types'

/** Identity bound to a single WebSocket connection. */
export interface PeerIdentity {
  /** User id — hook-provided (authoritative) or first-seen from a frame. */
  userId: string
  /** Connection-scoped client id — first-seen from a frame. */
  clientId: string
}

/**
 * Tracks the identity bound to each peer (connection) and rewrites
 * inbound frames so a peer can never emit frames under another user's or
 * client's identity.
 *
 * Binding happens once per connection: the user id comes from the
 * `multiplayer.authorize` hook when a handler calls `setUserId()`
 * (server-verified), otherwise from the first frame the peer sends
 * (trust-on-first-frame). The client id is always bound from the first
 * frame. Every subsequent frame is stamped with the bound identity —
 * mismatching `userId` / `user.id` / `clientId` values are overwritten
 * rather than trusted, which neutralizes spoofed leave/presence frames.
 */
export class PeerIdentityStore {
  private identities = new Map<string, PeerIdentity>()

  /** Returns the identity bound to `peerId`, if any. */
  get(peerId: string): PeerIdentity | undefined {
    return this.identities.get(peerId)
  }

  /**
   * Binds the identity for `peerId` if not already bound, then rewrites
   * `message` in place so its identity fields match the bound identity.
   *
   * @param peerId Transport-level peer id (crossws `peer.id`).
   * @param message Parsed inbound frame — mutated in place.
   * @param authorizedUserId User id set by the authorize hook, if any.
   */
  enforce(peerId: string, message: MultiplayerMessage, authorizedUserId?: string): void {
    let identity = this.identities.get(peerId)
    if (!identity) {
      identity = {
        userId: authorizedUserId ?? getMessageUserId(message),
        clientId: message.clientId,
      }
      this.identities.set(peerId, identity)
    }

    // Stamp the bound identity — client-supplied ids are never trusted
    // after binding.
    message.clientId = identity.clientId
    if (message.type === 'multiplayer:presence') {
      message.user.id = identity.userId
    }
    else {
      message.userId = identity.userId
    }
  }

  /** Drops the identity on disconnect. */
  forget(peerId: string): void {
    this.identities.delete(peerId)
  }
}

/** Extracts the user id carried by a frame, whatever its type. */
function getMessageUserId(message: MultiplayerMessage): string {
  return message.type === 'multiplayer:presence' ? message.user.id : message.userId
}
