import type { CollabServerMessage } from '@rstore/multiplayer/protocol'
import { COLLAB_PROTOCOL_VERSION, fromChannelFrame, isCollabClientMessage, isCollabServerMessage, negotiateCollabProtocol, parseCollabMessage, toChannelFrame } from '@rstore/multiplayer/protocol'
import { describe, expect, it } from 'vitest'

const tx = { docId: 'doc', clientId: 'c1', seq: 1, baseVersion: 0, ops: [{ t: 'text' as const, node: 'p1', ops: [{ insert: 'x' }] }] }

describe('collab frames', () => {
  it('accepts well-formed client and server frames', () => {
    expect(isCollabClientMessage({ type: 'collab:hello', docId: 'doc', clientId: 'c1', protocols: [1], baseVersion: 3, pending: [tx] })).toBe(true)
    expect(isCollabClientMessage({ type: 'collab:submit', tx })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:ack', docId: 'doc', seq: 1, version: 4 })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:ops', docId: 'doc', version: 4, clientId: 'c2', ops: [] })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:reject', docId: 'doc', seq: 1, reason: 'history-truncated', resync: true })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:reject', docId: 'doc', seq: 1, reason: 'unavailable' })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:welcome', docId: 'doc', protocol: 1, version: 4 })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:snapshot', docId: 'doc', version: 4, nodes: [] })).toBe(true)
  })

  it('rejects structurally invalid frames', () => {
    expect(isCollabClientMessage({ type: 'collab:submit', tx: { ...tx, seq: -1 } })).toBe(false)
    expect(isCollabClientMessage({ type: 'collab:submit', tx: { ...tx, ops: [{ t: 'nope' }] } })).toBe(false)
    expect(isCollabClientMessage({ type: 'collab:hello', docId: 'doc', clientId: 'c1', protocols: 'all' })).toBe(false)
    expect(isCollabServerMessage({ type: 'collab:reject', docId: 'doc', reason: 'because' })).toBe(false)
    expect(isCollabServerMessage({ type: 'collab:ack', docId: 'doc', seq: 1 })).toBe(false)
  })

  it('parses raw frames without throwing and reports invalid JSON frames', () => {
    const invalid: unknown[] = []
    expect(parseCollabMessage(JSON.stringify({ type: 'collab:submit', tx }))).toEqual({ type: 'collab:submit', tx })
    expect(parseCollabMessage('{nope', { onInvalid: value => invalid.push(value) })).toBeNull()
    expect(parseCollabMessage('{"type":"collab:submit"}', { onInvalid: value => invalid.push(value) })).toBeNull()
    expect(invalid).toEqual([{ type: 'collab:submit' }])
  })

  it('accepts protocol 2 channel frames and rejects them without a channel', () => {
    expect(isCollabClientMessage({ type: 'collab:hello', docId: 'doc', clientId: 'c1', protocols: [2, 1], ch: 3 })).toBe(true)
    expect(isCollabClientMessage({ type: 'collab:submit', ch: 3, seq: 1, baseVersion: 0, ops: tx.ops })).toBe(true)
    expect(isCollabClientMessage({ type: 'collab:submit', seq: 1, baseVersion: 0, ops: tx.ops })).toBe(false)
    expect(isCollabClientMessage({ type: 'collab:hello', docId: 'doc', clientId: 'c1', ch: -1 })).toBe(false)
    expect(isCollabServerMessage({ type: 'collab:ack', ch: 3, seq: 1, version: 4 })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:ops', ch: 3, version: 4, author: 0, ops: [] })).toBe(true)
    expect(isCollabServerMessage({ type: 'collab:ops', ch: 3, version: 4, ops: [] })).toBe(false)
    expect(isCollabServerMessage({ type: 'collab:ack', seq: 1, version: 4 })).toBe(false)
  })

  it('round-trips server frames through a channel, sending each author id once', () => {
    const serverAuthors = new Map<string, number>()
    const clientAuthors = new Map<number, { clientId: string, userId?: string }>()
    const frames: CollabServerMessage[] = [
      { type: 'collab:ops' as const, docId: 'doc', version: 1, clientId: 'c2', userId: 'u2', ops: tx.ops },
      { type: 'collab:ops' as const, docId: 'doc', version: 2, clientId: 'c3', ops: [] },
      { type: 'collab:ops' as const, docId: 'doc', version: 3, clientId: 'c2', userId: 'u2', ops: tx.ops },
      { type: 'collab:ack' as const, docId: 'doc', seq: 4, version: 4 },
    ]
    const wire = frames.map(frame => toChannelFrame(frame, 7, serverAuthors))
    expect(wire[2]).toEqual({ type: 'collab:ops', ch: 7, version: 3, author: 0, ops: tx.ops })
    expect(wire.every(frame => !('docId' in frame))).toBe(true)
    expect(wire.map(frame => fromChannelFrame(frame, 'doc', clientAuthors))).toEqual(frames)
  })

  it('negotiates the highest common protocol version', () => {
    expect(negotiateCollabProtocol([1, 2, 7])).toBe(COLLAB_PROTOCOL_VERSION)
    expect(negotiateCollabProtocol([COLLAB_PROTOCOL_VERSION + 1])).toBeNull()
    expect(negotiateCollabProtocol(undefined)).toBe(1)
  })
})
