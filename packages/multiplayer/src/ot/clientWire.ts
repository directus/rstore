import type { CollabClientMessage, CollabServerMessage, CollabWireClientMessage, CollabWireServerMessage } from '../protocol/collab.js'
import type { CollabChannelAuthors } from '../protocol/collabChannel.js'
import { fromChannelFrame, toChannelSubmit } from '../protocol/collabChannel.js'
import { SUPPORTED_COLLAB_PROTOCOLS } from '../protocol/version.js'

/** Last channel number handed out in this JS realm (unique per connection). */
let lastChannel = 0

/**
 * Wire side of a collab client: frames go out in the protocol negotiated by
 * the last welcome (protocol 1 until then), and incoming frames are matched
 * to the document by `docId` or by channel and decoded to protocol 1.
 */
export function createClientWire(docId: string, channel = ++lastChannel) {
  let protocol: number | null = null
  const authors: CollabChannelAuthors = new Map()

  return {
    channel,
    /** Protocols announced in the hello, preferred first. */
    protocols: [...SUPPORTED_COLLAB_PROTOCOLS].sort((a, b) => b - a),
    /** A new hello: until its welcome, frames use protocol 1. */
    reset(): void {
      protocol = null
    },
    /** Encodes an outgoing frame. */
    encode(frame: CollabClientMessage): CollabWireClientMessage {
      return frame.type === 'collab:submit' && protocol !== null && protocol >= 2 ? toChannelSubmit(frame, channel) : frame
    },
    /** The frame in protocol 1 form, or `null` when it belongs to another document. */
    decode(frame: CollabWireServerMessage): CollabServerMessage | null {
      if ('docId' in frame) {
        if (frame.docId !== docId || ('ch' in frame && frame.ch !== channel)) {
          return null
        }
        if (frame.type === 'collab:welcome') {
          protocol = frame.protocol
          authors.clear()
        }
        return frame as CollabServerMessage
      }
      return frame.ch === channel ? fromChannelFrame(frame, docId, authors) : null
    },
  }
}
