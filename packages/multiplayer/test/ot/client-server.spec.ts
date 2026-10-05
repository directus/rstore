import { createCollabClient } from '@rstore/multiplayer/ot'
import { COLLAB_PROTOCOL_VERSION } from '@rstore/multiplayer/protocol'
import { createCollabServer, createMemoryOpLogStore, OpLogAppendRejected, sequenceTransaction } from '@rstore/multiplayer/server'
import { describe, expect, it } from 'vitest'
import { buildNodes, outline, records } from './harness/docs'
import { insertText } from './harness/edits'
import { createSimulation } from './harness/simulation'

const doc = [{ id: 'p1', content: 'hello' }, { id: 'p2', content: 'secret' }]

/** Deferred authorization used to hold a delivery between its check and send. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('collab client and sequencer', () => {
  it('acks a submission, stamps node versions and broadcasts to other clients', async () => {
    const sim = await createSimulation(doc)
    sim.clients.A!.edit([insertText('p1', 5, '!')])
    expect(sim.clients.A!.client.status).toBe('awaiting')
    await sim.flush()
    const server = await sim.serverState()
    expect(server.version).toBe(1)
    expect(server.nodes.get('p1')).toMatchObject({ version: 1, content: [{ insert: 'hello!' }] })
    expect(server.nodes.get('p2')!.version).toBe(0)
    for (const { client } of Object.values(sim.clients)) {
      expect(client.status).toBe('synchronized')
      expect(records(client.state)).toEqual(records(server))
    }
  })

  it('keeps one transaction in flight and sends buffered edits as one transaction after the ack', async () => {
    const sim = await createSimulation(doc)
    const { edit } = sim.clients.A!
    edit([insertText('p1', 5, '1')])
    edit([insertText('p1', 6, '2')])
    edit([insertText('p2', 0, '3')])
    await sim.flush()
    const log = await sim.store.range(sim.docId, 0)
    expect(log.map(entry => entry.seq)).toEqual([1, 2])
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: hello12', 'paragraph#p2: 3secret'])
  })

  it('sequences a resubmitted transaction once and acks it again with the same version', async () => {
    const sim = await createSimulation(doc)
    sim.clients.A!.edit([insertText('p1', 0, '>')])
    const [submit] = sim.links.get('A')!.up
    await sim.flush()
    const acks: unknown[] = []
    await sim.server.handleMessage({ id: 'A', userId: 'A', send: frame => acks.push(frame) }, submit!)
    expect(acks).toEqual([expect.objectContaining({ type: 'collab:ack', seq: 1, version: 1 })])
    expect((await sim.serverState()).version).toBe(1)
  })

  it('does not apply an in-flight transaction twice when its ack was lost', async () => {
    const sim = await createSimulation(doc)
    sim.clients.A!.edit([insertText('p1', 0, '>')])
    await sim.deliverUp('A')
    sim.disconnect('A')
    sim.clients.B!.edit([insertText('p1', 5, '<')])
    await sim.flush()
    sim.reconnect('A')
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: >hello<', 'paragraph#p2: secret'])
    expect(records(sim.clients.A!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('rolls back a forbidden transaction on its author and keeps later buffered edits', async () => {
    const sim = await createSimulation(doc, {
      server: { hooks: { filterOp: ({ op }) => op.t === 'text' && op.node === 'p2' ? 'forbidden' : undefined } },
    })
    const rejected: unknown[] = []
    sim.clients.A!.client.on('rejected', event => rejected.push(event.reason))
    sim.clients.A!.edit([insertText('p2', 0, 'X')])
    sim.clients.A!.edit([insertText('p1', 0, 'ok ')])
    await sim.flush()
    expect(rejected).toEqual(['forbidden'])
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: ok hello', 'paragraph#p2: secret'])
    expect(records(sim.clients.A!.client.state)).toEqual(records(await sim.serverState()))
    expect(records(sim.clients.B!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('rejects an append-time revocation without an ack or peer broadcast', async () => {
    const store = createMemoryOpLogStore()
    store.append = async () => {
      throw new OpLogAppendRejected('unavailable')
    }
    const sim = await createSimulation(doc, {
      store,
      server: { hooks: { authorize: () => ({ appendContext: { principal: 'revoked' } }) } },
    })
    sim.clients.A!.edit([insertText('p1', 0, 'x')])
    await sim.deliverUp('A')
    expect(sim.links.get('A')!.down).toEqual([expect.objectContaining({ type: 'collab:reject', reason: 'unavailable' })])
    expect(sim.links.get('B')!.down).toEqual([])
    expect(await store.head(sim.docId)).toBe(0)
  })

  it('forgets a node whose refused creation was rolled back', async () => {
    const sim = await createSimulation(doc, {
      server: { hooks: { filterOp: ({ op }) => op.t === 'insertNode' ? 'forbidden' : undefined } },
    })
    sim.clients.A!.edit([{ t: 'insertNode', node: { id: 'x', parentId: null, orderKey: 'a5', type: 'paragraph', attrs: {}, content: [{ insert: 'new' }] } }])
    await sim.flush()
    expect(sim.clients.A!.client.state.nodes.has('x')).toBe(false)
    expect(records(sim.clients.A!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('rolls back only the refused ops of a rejected multi-op transaction', async () => {
    const sim = await createSimulation(doc, {
      server: { hooks: { filterOp: ({ op }) => op.t === 'text' && op.node === 'p2' ? 'forbidden' : undefined } },
    })
    const rejected: unknown[] = []
    sim.clients.A!.client.on('rejected', event => rejected.push(event.ops))
    sim.disconnect('A')
    // Offline edits are composed into one transaction.
    sim.clients.A!.edit([insertText('p1', 0, '1 ')])
    sim.clients.A!.edit([insertText('p2', 0, 'no ')])
    sim.clients.A!.edit([insertText('p1', 7, ' 2')])
    sim.reconnect('A')
    await sim.flush()
    expect(rejected).toEqual([[insertText('p2', 0, 'no ')]])
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: 1 hello 2', 'paragraph#p2: secret'])
    expect(records(sim.clients.A!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('transforms server-authored ops against concurrent edits and deduplicates them by (clientId, seq)', async () => {
    const sim = await createSimulation(doc)
    sim.clients.A!.edit([insertText('p1', 0, 'A:')])
    await sim.flush()
    // Authored against version 0, before A's edit.
    const first = await sim.server.submitServer(sim.docId, [insertText('p1', 5, ' [bot]')], { baseVersion: 0, clientId: 'bot', seq: 7 })
    const again = await sim.server.submitServer(sim.docId, [insertText('p1', 5, ' [bot]')], { baseVersion: 0, clientId: 'bot', seq: 7 })
    await sim.flush()
    expect(again.version).toBe(first.version)
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: A:hello [bot]', 'paragraph#p2: secret'])
    expect(records(sim.clients.B!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('sends version-only frames for ops on nodes hidden from a peer', async () => {
    const sim = await createSimulation(doc, {
      server: { hooks: { redact: ({ peer, node }) => peer.userId === 'B' && node.id === 'p2' ? null : node } },
    })
    const received: unknown[] = []
    sim.clients.B!.client.on('change', event => received.push(event.origin))
    expect(sim.clients.B!.client.state.nodes.has('p2')).toBe(false)
    sim.clients.A!.edit([insertText('p2', 0, 'top ')])
    await sim.flush()
    expect(sim.links.get('B')!.down).toEqual([])
    expect(sim.clients.B!.client.confirmedVersion).toBe(1)
    expect(sim.clients.B!.client.state.nodes.has('p2')).toBe(false)
    // B's next edit is based on version 1 and applies without transform issues.
    sim.clients.B!.edit([insertText('p1', 0, 'B:')])
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: B:hello', 'paragraph#p2: top secret'])
  })

  it('uses channel frames without document and client ids once protocol 2 is negotiated', async () => {
    const sim = await createSimulation(doc)
    sim.clients.A!.edit([insertText('p1', 5, '!')])
    const [submit] = sim.links.get('A')!.up
    expect(submit).toEqual({ type: 'collab:submit', ch: expect.any(Number), seq: 1, baseVersion: 0, ops: [insertText('p1', 5, '!')] })
    await sim.deliverUp('A')
    expect(sim.links.get('A')!.down).toEqual([{ type: 'collab:ack', ch: (submit as { ch: number }).ch, seq: 1, version: 1 }])
    expect(sim.links.get('B')!.down).toEqual([{ type: 'collab:ops', ch: expect.any(Number), version: 1, author: 0, clientId: 'A', userId: 'A', ops: [insertText('p1', 5, '!')] }])
    await sim.flush()
    sim.clients.A!.edit([insertText('p1', 0, '?')])
    await sim.deliverUp('A')
    // The author's ids are sent once per channel.
    expect(sim.links.get('B')!.down).toEqual([{ type: 'collab:ops', ch: expect.any(Number), version: 2, author: 0, ops: [insertText('p1', 0, '?')] }])
    const events: unknown[] = []
    sim.clients.B!.client.on('change', event => events.push({ clientId: event.clientId, userId: event.userId }))
    await sim.flush()
    expect(events).toEqual([{ clientId: 'A', userId: 'A' }])
    expect(records(sim.clients.B!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('sends full frames before the welcome and keeps serving protocol 1 clients', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const server = createCollabServer({ store })
    const frames: unknown[] = []
    const peer = { id: 'old', send: (frame: unknown) => frames.push(frame) }
    await server.handleMessage(peer, { type: 'collab:hello', docId: 'doc', clientId: 'old', protocols: [1], baseVersion: 0, ch: 4 })
    await server.handleMessage(peer, { type: 'collab:submit', tx: { docId: 'doc', clientId: 'old', seq: 1, baseVersion: 0, ops: [insertText('p1', 0, '>')] } })
    expect(frames).toEqual([
      { type: 'collab:welcome', docId: 'doc', protocol: 1, version: 0 },
      { type: 'collab:ack', docId: 'doc', seq: 1, version: 1 },
    ])

    const sim = await createSimulation(doc, { store, seed: false })
    sim.clients.A!.client.disconnect()
    sim.reconnect('A')
    // Edit before the welcome arrives: the client does not know yet whether the server speaks protocol 2.
    sim.clients.B!.edit([insertText('p2', 0, '+')])
    sim.clients.A!.edit([insertText('p1', 0, '<')])
    expect(sim.links.get('A')!.up.at(-1)).toMatchObject({ type: 'collab:submit', tx: { docId: 'doc', clientId: 'A' } })
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual(['paragraph#p1: <>hello', 'paragraph#p2: +secret'])
    expect(records(sim.clients.A!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('refuses channel frames on a channel the connection did not open', async () => {
    const sim = await createSimulation(doc)
    const frames: unknown[] = []
    await sim.server.handleMessage({ id: 'stranger', send: frame => frames.push(frame) }, { type: 'collab:submit', ch: 0, seq: 1, baseVersion: 0, ops: [insertText('p1', 0, 'x')] })
    expect(frames).toEqual([{ type: 'collab:reject', ch: 0, seq: 1, reason: 'unauthorized' }])
    expect((await sim.serverState()).version).toBe(0)
  })

  it('rejects a hello with no common protocol version', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const server = createCollabServer({ store })
    const frames: unknown[] = []
    await server.handleMessage({ id: 'x', send: frame => frames.push(frame) }, { type: 'collab:hello', docId: 'doc', clientId: 'x', protocols: [COLLAB_PROTOCOL_VERSION + 1] })
    expect(frames).toEqual([{ type: 'collab:reject', docId: 'doc', reason: 'protocol' }])
  })

  it('sequences on a shared op log from two stateless servers without losing an update', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const results = await Promise.all([
      sequenceTransaction(store, { docId: 'doc', clientId: 'A', seq: 1, baseVersion: 0, ops: [insertText('p1', 0, 'a')] }),
      sequenceTransaction(store, { docId: 'doc', clientId: 'B', seq: 1, baseVersion: 0, ops: [insertText('p1', 5, 'b')] }),
    ])
    expect(results.map(result => result.status)).toEqual(['ok', 'ok'])
    expect(outline(store.state('doc'))).toEqual(['paragraph#p1: ahellob', 'paragraph#p2: secret'])
  })

  it('does not broadcast to a subscriber denied after its hello', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    let allowed = true
    const server = createCollabServer({ store, hooks: { canDeliver: () => allowed } })
    const frames: unknown[] = []
    await server.handleMessage({ id: 'reader', send: frame => frames.push(frame) }, { type: 'collab:hello', docId: 'doc', clientId: 'reader', protocols: [1], baseVersion: 0 })
    frames.length = 0

    allowed = false
    await server.submitServer('doc', [insertText('p1', 0, '!')], { clientId: 'writer', seq: 1 })

    expect(frames).toEqual([])
  })

  it('does not replay external commits to a subscriber denied after its hello', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const writer = createCollabServer({ store })
    let allowed = true
    const remote = createCollabServer({ store, hooks: { canDeliver: () => allowed } })
    const frames: unknown[] = []
    await remote.handleMessage({ id: 'reader', send: frame => frames.push(frame) }, { type: 'collab:hello', docId: 'doc', clientId: 'reader', protocols: [1], baseVersion: 0 })
    frames.length = 0

    allowed = false
    await writer.submitServer('doc', [insertText('p1', 0, '!')], { clientId: 'writer', seq: 1 })
    const [entry] = await store.range('doc', 0)
    const payload = { docId: 'doc', entry: entry!, nodes: await store.loadNodes('doc') }
    await remote.ingestCommitted(payload)

    expect(frames).toEqual([])
    allowed = true
    await remote.ingestCommitted(payload)
    expect(frames).toEqual([expect.objectContaining({ type: 'collab:ops', version: 1 })])
  })

  it('suppresses delivery when current receiver authorization throws', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const canDeliver = () => {
      throw new Error('authorization unavailable')
    }
    const server = createCollabServer({ store, hooks: { canDeliver } })
    const frames: unknown[] = []
    await server.handleMessage({ id: 'reader', send: frame => frames.push(frame) }, { type: 'collab:hello', docId: 'doc', clientId: 'reader', protocols: [1], baseVersion: 0 })
    frames.length = 0

    await expect(server.submitServer('doc', [insertText('p1', 0, '!')], { clientId: 'writer', seq: 1 })).resolves.toMatchObject({ version: 1 })

    expect(frames).toEqual([])
  })

  it('does not send after a peer closes while delivery authorization awaits', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const writer = createCollabServer({ store })
    const gate = deferred<boolean>()
    let wait = false
    let checked = false
    const remote = createCollabServer({
      store,
      hooks: { canDeliver: () => wait ? (checked = true, gate.promise) : true },
    })
    const frames: unknown[] = []
    const peer = { id: 'reader', send: (frame: unknown) => frames.push(frame) }
    await remote.handleMessage(peer, { type: 'collab:hello', docId: 'doc', clientId: 'reader', protocols: [1], baseVersion: 0 })
    frames.length = 0

    wait = true
    await writer.submitServer('doc', [insertText('p1', 0, '!')], { clientId: 'writer', seq: 1 })
    const [entry] = await store.range('doc', 0)
    const replay = remote.ingestCommitted({ docId: 'doc', entry: entry!, nodes: await store.loadNodes('doc') })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(checked).toBe(true)
    remote.handleClose(peer.id)
    gate.resolve(true)
    await replay

    expect(frames).toEqual([])
  })

  it('replays durable commits across servers in order, rejects forged payloads, and bounds missed replay', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const writer = createCollabServer({ store })
    const remote = createCollabServer({ store, maxIngressReplay: 10 })
    const frames: unknown[] = []
    const peer = { id: 'remote-peer', send: (frame: unknown) => frames.push(frame) }
    await remote.handleMessage(peer, { type: 'collab:hello', docId: 'doc', clientId: 'reader', protocols: [1], baseVersion: 0 })
    frames.length = 0
    const bounded = createCollabServer({ store, maxIngressReplay: 1 })
    const boundedFrames: unknown[] = []
    await bounded.handleMessage({ id: 'bounded-peer', send: (frame: unknown) => boundedFrames.push(frame) }, { type: 'collab:hello', docId: 'doc', clientId: 'bounded-reader', protocols: [1], baseVersion: 0 })
    boundedFrames.length = 0
    await writer.submitServer('doc', [insertText('p1', 0, 'A')], { clientId: 'writer', seq: 1 })
    await writer.submitServer('doc', [insertText('p1', 1, 'B')], { clientId: 'writer', seq: 2 })
    const entries = await store.range('doc', 0)
    const payload = { docId: 'doc', entry: entries[1]!, nodes: await store.loadNodes('doc') }
    await expect(remote.ingestCommitted(payload)).resolves.toEqual({ status: 'delivered', version: 2 })
    expect(frames).toEqual([
      expect.objectContaining({ type: 'collab:ops', version: 1, clientId: 'writer' }),
      expect.objectContaining({ type: 'collab:ops', version: 2, clientId: 'writer' }),
    ])
    await expect(remote.ingestCommitted({ ...payload, entry: { ...payload.entry, ops: [] } })).resolves.toEqual({ status: 'ignored', reason: 'mismatch' })
    await expect(remote.ingestCommitted({ docId: 'doc', entry: entries[0]!, nodes: payload.nodes })).resolves.toEqual({ status: 'duplicate', version: 1 })

    await expect(bounded.ingestCommitted(payload)).resolves.toEqual({ status: 'delivered', version: 2 })
    expect(boundedFrames).toEqual([expect.objectContaining({ type: 'collab:snapshot', version: 2 })])
  })

  it('does not replay a local append when its durable event returns on a rebound peer', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 0)
    const server = createCollabServer({ store })
    const frames: unknown[] = []
    const peer = () => ({ id: 'writer', send: (frame: unknown) => frames.push(frame) })
    await server.handleMessage(peer(), { type: 'collab:hello', docId: 'doc', clientId: 'writer', protocols: [1], baseVersion: 0 })
    frames.length = 0
    await server.handleMessage(peer(), { type: 'collab:submit', tx: { docId: 'doc', clientId: 'writer', seq: 1, baseVersion: 0, ops: [insertText('p1', 0, 'A')] } })
    const [entry] = await store.range('doc', 0)
    frames.length = 0
    await expect(server.ingestCommitted({ docId: 'doc', entry: entry!, nodes: await store.loadNodes('doc') })).resolves.toEqual({ status: 'duplicate', version: 1 })
    expect(frames).toEqual([])
  })

  it('loads a snapshot on first connect', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes(doc), 3)
    const server = createCollabServer({ store })
    const client = createCollabClient({
      docId: 'doc',
      clientId: 'c',
      send: frame => server.handleMessage({ id: 'c', send: reply => client.receive(reply) }, frame),
    })
    client.connect()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(client.confirmedVersion).toBe(3)
    expect(outline(client.state)).toEqual(['paragraph#p1: hello', 'paragraph#p2: secret'])
  })
})
