import type { DocOp } from '@rstore/multiplayer/ot'
import type { Buffer } from 'node:buffer'
import { constants, createDeflateRaw } from 'node:zlib'
import { toChannelFrame, toChannelSubmit } from '@rstore/multiplayer/protocol'
import * as Y from 'yjs'

/** Median of a list of sizes. */
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!

/**
 * Sizes after permessage-deflate with context takeover (the WebSocket
 * default in browsers and `ws`): one raw deflate stream, each message
 * sync-flushed, minus the 4-byte tail the extension strips.
 */
async function deflatedSizes(messages: Uint8Array[]): Promise<number[]> {
  const deflate = createDeflateRaw()
  let pending = 0
  deflate.on('data', (chunk: Buffer) => {
    pending += chunk.length
  })
  const sizes: number[] = []
  for (const message of messages) {
    deflate.write(message)
    await new Promise<void>(resolve => deflate.flush(constants.Z_SYNC_FLUSH, () => resolve()))
    sizes.push(pending - 4)
    pending = 0
  }
  deflate.close()
  return sizes
}

/** Raw and deflated medians of a list of frames. */
async function summarize(frames: Uint8Array[]) {
  return { median: median(frames.map(frame => frame.length)), deflated: median(await deflatedSizes(frames)) }
}

/** Keystroke traces: `sequential` (typing at the caret) and `scattered` (X1's trace, positions jump). */
const TRACES = {
  sequential: (i: number) => 500 + i,
  scattered: (i: number) => (i * 13) % 2_000,
}

/**
 * E8: one keystroke per frame on a 2 000-character paragraph with UUID
 * document, client, user and node ids. OT frames are protocol 2 channel
 * frames (`collab:submit` up, `collab:ops` down, JSON); the Yjs baseline is
 * the same edits on a y-prosemirror-shaped document (`XmlFragment` >
 * paragraph `XmlElement` > `XmlText`), each update wrapped like a
 * y-websocket sync message (3 bytes for updates under 128 bytes).
 */
export async function measureKeystrokeFrames(count = 1_000) {
  const encoder = new TextEncoder()
  const uuid = () => globalThis.crypto.randomUUID()
  const node = uuid()
  const result: Record<string, unknown> = {}
  for (const [name, position] of Object.entries(TRACES)) {
    const authors = new Map<string, number>()
    const submit: Uint8Array[] = []
    const remote: Uint8Array[] = []
    const author = uuid()
    const user = uuid()
    for (let i = 0; i < count; i++) {
      const ops: DocOp[] = [{ t: 'text', node, ops: [{ retain: position(i) }, { insert: 'a' }] }]
      submit.push(encoder.encode(JSON.stringify(toChannelSubmit({ type: 'collab:submit', tx: { docId: uuid(), clientId: author, seq: i + 1, baseVersion: 10_000 + i, ops } }, 1))))
      remote.push(encoder.encode(JSON.stringify(toChannelFrame({ type: 'collab:ops', docId: uuid(), version: 10_001 + i, clientId: author, userId: user, ops }, 1, authors))))
    }
    const doc = new Y.Doc()
    const paragraph = new Y.XmlElement('paragraph')
    const text = new Y.XmlText()
    doc.getXmlFragment('prosemirror').insert(0, [paragraph])
    paragraph.insert(0, [text])
    text.insert(0, 'lorem ipsum '.repeat(200).slice(0, 2_000))
    const yjs: Uint8Array[] = []
    doc.on('update', (update: Uint8Array) => yjs.push(new Uint8Array([0, 2, update.length, ...update])))
    for (let i = 0; i < count; i++) {
      text.insert(position(i), 'a')
    }
    const ot = { submit: await summarize(submit), ops: await summarize(remote) }
    const baseline = await summarize(yjs)
    result[name] = {
      ot,
      yjs: baseline,
      ratio: { raw: ot.ops.median / baseline.median, deflated: ot.ops.deflated / baseline.deflated },
    }
  }
  const scattered = result.scattered as { ot: { submit: { median: number }, ops: { median: number } } }
  return { ot: scattered.ot, traces: result }
}
