import type { TokenBucketOptions } from '@rstore/multiplayer/server'
import type { Peer } from 'crossws'
import type { RstoreCollabPeer } from './collab'
import { isCollabClientMessage } from '@rstore/multiplayer/protocol'
import { PeerRateLimiter } from '@rstore/multiplayer/server'
import { useRstoreCollabServer } from './collab'

/** Limits of `collab:*` frames (module option `collab`). */
export interface CollabRouteOptions {
  /** Larger than room frames: a reconnecting client resubmits its offline edits. */
  maxMessageBytes: number
  rateLimit: TokenBucketOptions | null
}

/**
 * Routes `collab:*` frames of the multiplayer endpoint to the collab
 * sequencer (`useRstoreCollabServer()`), with their own size and rate
 * limits. Other frames are left to the room server.
 */
export function createCollabRoute(options: CollabRouteOptions) {
  const rateLimiter = options.rateLimit ? new PeerRateLimiter(options.rateLimit) : null
  /** One collab peer per connection: the sequencer matches replies by identity. */
  const peers = new Map<string, RstoreCollabPeer>()

  const collabPeer = (ws: Peer): RstoreCollabPeer => {
    let peer = peers.get(ws.id)
    if (!peer) {
      peer = { id: ws.id, ws, send: frame => ws.send(JSON.stringify(frame)) }
      peers.set(ws.id, peer)
    }
    return peer
  }

  return {
    /**
     * Handles `text` when it is a collab frame (invalid or refused ones are
     * dropped); returns `undefined` for any other frame.
     */
    route(ws: Peer, text: string): Promise<void> | undefined {
      // Larger frames are left to the room server, which drops them by its own limit.
      if (text.length > options.maxMessageBytes || !text.includes('"collab:')) {
        return undefined
      }
      let frame: unknown
      try {
        frame = JSON.parse(text)
      }
      catch {
        return undefined
      }
      if (typeof (frame as { type?: unknown })?.type !== 'string' || !(frame as { type: string }).type.startsWith('collab:')) {
        return undefined
      }
      if ((rateLimiter && !rateLimiter.consume(ws.id)) || !isCollabClientMessage(frame)) {
        return Promise.resolve()
      }
      return useRstoreCollabServer().handleMessage(collabPeer(ws), frame)
    },
    /** Forgets a closed connection. */
    close(peerId: string): void {
      if (peers.delete(peerId)) {
        useRstoreCollabServer().handleClose(peerId)
      }
      rateLimiter?.forget(peerId)
    },
  }
}
