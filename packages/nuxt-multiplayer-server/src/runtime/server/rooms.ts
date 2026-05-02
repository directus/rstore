import type { MultiplayerMessage } from './types'

/**
 * Minimal peer abstraction we depend on. Matches crossws' `Peer` surface
 * but is reimplemented here to keep the room layer testable without
 * pulling in the full crossws types (which require a real WS runtime).
 */
export interface RoomPeer {
  /** Stable id assigned by the transport (crossws `peer.id`). */
  id: string
  /** Send a JSON-serializable payload. Implementations stringify. */
  send: (payload: unknown) => void
}

/**
 * Membership + broadcast for a single room. Rooms are created lazily by
 * `RoomRegistry.joinOrCreate()` and torn down when the last peer leaves.
 */
export class Room {
  readonly id: string
  /** Peers keyed by `peer.id`. */
  readonly peers = new Map<string, RoomPeer>()
  /** Peer count ceiling — once reached, further joins are rejected. */
  readonly maxSize: number

  constructor(id: string, maxSize: number) {
    this.id = id
    this.maxSize = maxSize
  }

  /**
   * Add a peer. Returns `false` when the room is at capacity; the caller
   * should close or reject the peer in that case.
   */
  add(peer: RoomPeer): boolean {
    if (this.peers.has(peer.id)) {
      return true
    }
    if (this.peers.size >= this.maxSize) {
      return false
    }
    this.peers.set(peer.id, peer)
    return true
  }

  remove(peerId: string): void {
    this.peers.delete(peerId)
  }

  /**
   * Send `message` to every peer, excluding `exceptPeerId` if provided.
   *
   * The recipient set is snapshotted *before* iteration starts so:
   * - peers that join mid-broadcast (e.g. via a synchronous reaction in
   *   another peer's `send`) do not receive the in-flight message;
   * - peers that leave mid-broadcast still get the message in flight (the
   *   alternative — racing the leave — would be just as surprising).
   */
  broadcast(message: MultiplayerMessage, exceptPeerId?: string): void {
    const snapshot: Array<[string, RoomPeer]> = Array.from(this.peers)
    for (const [peerId, peer] of snapshot) {
      if (exceptPeerId && peerId === exceptPeerId) {
        continue
      }
      try {
        peer.send(message)
      }
      catch (error) {
        console.error('[rstore-multiplayer-server] failed to broadcast to peer', peerId, error)
      }
    }
  }

  get size(): number {
    return this.peers.size
  }
}

/**
 * Registry of active rooms. Thin wrapper around a `Map<string, Room>` that
 * takes care of lazy creation and eviction when rooms become empty.
 */
export class RoomRegistry {
  readonly rooms = new Map<string, Room>()
  readonly maxRoomSize: number

  constructor(options: { maxRoomSize?: number } = {}) {
    this.maxRoomSize = options.maxRoomSize ?? 100
  }

  /** Returns the room, creating it if necessary. */
  getOrCreate(roomId: string): Room {
    let room = this.rooms.get(roomId)
    if (!room) {
      room = new Room(roomId, this.maxRoomSize)
      this.rooms.set(roomId, room)
    }
    return room
  }

  /**
   * Removes `peerId` from `roomId`. Drops the room when it becomes empty.
   * Safe to call for rooms/peers that do not exist.
   */
  leave(roomId: string, peerId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) {
      return
    }
    room.remove(peerId)
    if (room.size === 0) {
      this.rooms.delete(roomId)
    }
  }

  /** Removes `peerId` from every room it's in. Used on disconnect. */
  leaveAll(peerId: string): string[] {
    const affected: string[] = []
    for (const [roomId, room] of this.rooms) {
      if (room.peers.has(peerId)) {
        room.remove(peerId)
        affected.push(roomId)
        if (room.size === 0) {
          this.rooms.delete(roomId)
        }
      }
    }
    return affected
  }
}
