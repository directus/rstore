import type { CollabServerMessage } from '../protocol/collab.js'
import type { CollabAccess, CollabPeer } from './collabServer.js'
import { toChannelFrame } from '../protocol/collabChannel.js'

/** A peer subscribed to a document. */
export interface CollabSubscription {
  peer: CollabPeer
  docId: string
  access: CollabAccess
  /** Client id announced in the hello: submissions must carry it. */
  clientId: string
  /** Negotiated protocol version. */
  protocol: number
  /** Channel of the hello (protocol 2 frames use it instead of ids). */
  ch?: number
  /** Protocol 2 author numbers of the channel (clientId → number). */
  authors: Map<string, number>
  /** Highest version this server has sent to this peer. */
  version: number
  /**
   * Versions whose ops were rewritten for this client by redaction, with the
   * nodes they touched: a later submission based before them may have been
   * transformed differently by the client, its ack then carries corrections.
   * Shared by the subscriptions of one client id, so it survives reconnects.
   */
  rewrites: Array<{ version: number, ids: string[] }>
}

/**
 * Subscriptions of a collab server: per document (for broadcasts) and per
 * connection channel (to resolve protocol 2 frames, which carry no ids).
 */
export function createSubscriptionRegistry() {
  const byDoc = new Map<string, Map<string, CollabSubscription>>()
  const byChannel = new Map<string, Map<number, CollabSubscription>>()
  const rewrites = new Map<string, CollabSubscription['rewrites']>()

  return {
    /** Registers (or replaces) the subscription of a peer to a document. */
    add(subscription: CollabSubscription): void {
      let docSubscriptions = byDoc.get(subscription.docId)
      if (!docSubscriptions) {
        byDoc.set(subscription.docId, docSubscriptions = new Map())
      }
      docSubscriptions.set(subscription.peer.id, subscription)
      if (subscription.ch !== undefined) {
        let channels = byChannel.get(subscription.peer.id)
        if (!channels) {
          byChannel.set(subscription.peer.id, channels = new Map())
        }
        channels.set(subscription.ch, subscription)
      }
    },
    /**
     * Rewrites list of a client of a document (see `CollabSubscription.rewrites`),
     * created on first use. Lists stay small: acks prune them.
     */
    rewritesOf(docId: string, clientId: string): CollabSubscription['rewrites'] {
      const key = `${docId}\u0000${clientId}`
      let list = rewrites.get(key)
      if (!list) {
        rewrites.set(key, list = [])
      }
      return list
    },
    /** The subscription of a peer to a document. */
    get: (docId: string, peerId: string): CollabSubscription | undefined => byDoc.get(docId)?.get(peerId),
    /** The subscription a peer opened on a channel. */
    channel: (peerId: string, ch: number): CollabSubscription | undefined => byChannel.get(peerId)?.get(ch),
    /** Every subscription of a document. */
    ofDoc: (docId: string): Iterable<CollabSubscription> => byDoc.get(docId)?.values() ?? [],
    /** Whether a subscription still belongs to this exact connection object. */
    isCurrent(subscription: CollabSubscription, peer: CollabPeer): boolean {
      return byDoc.get(subscription.docId)?.get(peer.id) === subscription && subscription.peer === peer
    },
    /** Removes this document only when it still belongs to the checked connection. */
    remove(subscription: CollabSubscription, peer: CollabPeer): void {
      if (byDoc.get(subscription.docId)?.get(peer.id) !== subscription || subscription.peer !== peer) {
        return
      }
      const docSubscriptions = byDoc.get(subscription.docId)!
      docSubscriptions.delete(peer.id)
      if (!docSubscriptions.size) {
        byDoc.delete(subscription.docId)
      }
      if (subscription.ch !== undefined) {
        const channels = byChannel.get(peer.id)
        if (channels?.get(subscription.ch) === subscription) {
          channels.delete(subscription.ch)
          if (!channels.size) {
            byChannel.delete(peer.id)
          }
        }
      }
    },
    /** Forgets every subscription of a closed connection. */
    removePeer(peerId: string): void {
      for (const [docId, docSubscriptions] of byDoc) {
        docSubscriptions.delete(peerId)
        if (!docSubscriptions.size) {
          byDoc.delete(docId)
        }
      }
      byChannel.delete(peerId)
    },
  }
}

/** Sends a frame in the protocol the subscription negotiated. */
export function sendTo(subscription: CollabSubscription, frame: CollabServerMessage): void {
  if (subscription.protocol >= 2 && subscription.ch !== undefined) {
    subscription.peer.send(toChannelFrame(frame, subscription.ch, subscription.authors))
  }
  else {
    subscription.peer.send(frame)
  }
}
