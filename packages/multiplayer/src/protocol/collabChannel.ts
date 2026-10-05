import type { CollabChannelServerMessage, CollabChannelSubmitMessage, CollabServerMessage, CollabSubmitMessage, CollabWireServerMessage } from './collab.js'

/** Author table of a channel on the client: author number → ids. */
export type CollabChannelAuthors = Map<number, { clientId: string, userId?: string }>

/**
 * Encodes a server frame for a protocol 2 channel: `ch` replaces `docId`,
 * and `collab:ops` names its author by a number, sending the author's ids
 * only the first time (`authors` is the server-side table of the channel,
 * clientId → number). The welcome keeps its document id.
 */
export function toChannelFrame(frame: CollabServerMessage, ch: number, authors: Map<string, number>): CollabWireServerMessage {
  if (frame.type === 'collab:welcome') {
    return { ...frame, ch }
  }
  const { docId: _docId, ...rest } = frame
  if (rest.type !== 'collab:ops') {
    return { ...rest, ch } as CollabChannelServerMessage
  }
  const { clientId, userId, ...ops } = rest
  let author = authors.get(clientId)
  if (author !== undefined) {
    return { ...ops, ch, author }
  }
  author = authors.size
  authors.set(clientId, author)
  return { ...ops, ch, author, clientId, ...(userId !== undefined ? { userId } : {}) }
}

/**
 * Decodes a protocol 2 channel frame back to its protocol 1 form, given the
 * document of the channel and the client-side author table (filled as
 * authors appear). Frames that already carry a `docId` pass through.
 */
export function fromChannelFrame(frame: CollabWireServerMessage, docId: string, authors: CollabChannelAuthors): CollabServerMessage {
  if (!('ch' in frame) || 'docId' in frame) {
    return frame as CollabServerMessage
  }
  const { ch: _ch, ...rest } = frame
  if (rest.type !== 'collab:ops') {
    return { ...rest, docId } as CollabServerMessage
  }
  const { author, clientId, userId, ...ops } = rest
  if (clientId !== undefined) {
    authors.set(author, { clientId, ...(userId !== undefined ? { userId } : {}) })
  }
  const known = authors.get(author)
  return { ...ops, docId, clientId: known?.clientId ?? `author:${author}`, ...(known?.userId !== undefined ? { userId: known.userId } : {}) }
}

/** Encodes a submission for a protocol 2 channel (no document or client id). */
export function toChannelSubmit(frame: CollabSubmitMessage, ch: number): CollabChannelSubmitMessage {
  const { seq, baseVersion, ops } = frame.tx
  return { type: 'collab:submit', ch, seq, baseVersion, ops }
}
