import type { DocNodeRecord, DocState } from '@rstore/multiplayer/ot'
import type { CollabServerHooks } from '@rstore/multiplayer/server'
import { appendFileSync } from 'node:fs'
import process from 'node:process'
import { mergeNodeOp, splitNodeOp } from '@rstore/multiplayer/ot'
import { describe, expect, it } from 'vitest'
import { outline, records } from './harness/docs'
import { insertText } from './harness/edits'
import { runFuzz } from './harness/fuzz'
import { createSimulation } from './harness/simulation'

/** `private:*` nodes are hidden from B; `secret` attributes are masked for B. */
const redact: NonNullable<CollabServerHooks['redact']> = ({ peer, node }) => {
  if (peer.userId !== 'B') {
    return node
  }
  if (node.id.startsWith('private:')) {
    return null
  }
  return 'secret' in node.attrs ? { ...node, attrs: { ...node.attrs, secret: '***' } } : node
}

/** The server document as B may see it. */
function viewOfB(state: DocState): DocNodeRecord[] {
  return records(state).flatMap(node => redact({ peer: { id: 'B', userId: 'B', send: () => {} }, node }) ?? [])
}

const doc = [{ id: 'p1', content: 'hello world' }, { id: 'private:x', content: 'hidden' }, { id: 'p2', content: 'end' }]

describe('redaction of ops mixing hidden and visible nodes', () => {
  it('sends a split into a hidden node as a deletion of the tail', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    sim.clients.A!.edit(state => [splitNodeOp(state, 'p1', 5, 'private:tail')])
    await sim.flush()
    expect(outline(sim.clients.B!.client.state)).toEqual(['paragraph#p1: hello', 'paragraph#p2: end'])
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
  })

  it('sends a merge of a hidden node as text inserted into the visible target', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    sim.clients.A!.edit(state => [mergeNodeOp(state, 'private:x', 'p1')])
    await sim.flush()
    expect(outline(sim.clients.B!.client.state)).toEqual(['paragraph#p1: hello worldhidden', 'paragraph#p2: end'])
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
  })

  it('sends a merge into a hidden node as a deletion', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    sim.clients.A!.edit(state => [mergeNodeOp(state, 'p2', 'private:x')])
    await sim.flush()
    expect(outline(sim.clients.B!.client.state)).toEqual(['paragraph#p1: hello world'])
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
  })

  it('sends reduced nodes as the peer sees them', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    sim.clients.A!.edit([{ t: 'setAttrs', node: 'p1', attrs: { secret: 'k', level: 1 } }])
    sim.clients.A!.edit(state => [splitNodeOp(state, 'p2', 1, 'p3', { newAttrs: { secret: 'z' } })])
    await sim.flush()
    expect(sim.clients.B!.client.state.nodes.get('p1')!.attrs).toEqual({ secret: '***', level: 1 })
    expect(sim.clients.B!.client.state.nodes.get('p3')!.attrs).toEqual({ secret: '***' })
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
    expect(JSON.stringify(sim.clients.B!.client.state.nodes.get('p1'))).not.toContain('"k"')
  })

  it('corrects a peer whose concurrent edit the server moved into a hidden node', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    sim.clients.A!.edit(state => [splitNodeOp(state, 'p1', 5, 'private:tail')])
    sim.clients.B!.edit([insertText('p1', 11, '!')])
    await sim.deliverUp('A')
    await sim.flush()
    expect(outline(await sim.serverState())).toContain('paragraph#private:tail:  world!')
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
    expect(sim.clients.B!.client.status).toBe('synchronized')
  })

  it('corrects a peer whose ack was lost while its edit needed corrections', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    sim.clients.A!.edit(state => [splitNodeOp(state, 'p1', 5, 'private:tail')])
    sim.clients.B!.edit([insertText('p1', 11, '!')])
    await sim.deliverUp('A')
    sim.deliverDown('B')
    await sim.deliverUp('B')
    // The ack (with its corrections) is lost with the connection.
    sim.disconnect('B')
    sim.reconnect('B')
    await sim.flush()
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
  })

  it('catches up a peer that sees every node without reloading it', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    sim.clients.A!.edit([insertText('p1', 0, '>')])
    await sim.deliverUp('A')
    sim.disconnect('A')
    sim.reconnect('A')
    await sim.deliverUp('A')
    expect(sim.links.get('A')!.down.map(frame => frame.type)).toEqual(['collab:welcome', 'collab:ack'])
  })

  it('drops buffered edits made on a node the ack corrected', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    const rejected: unknown[] = []
    sim.clients.B!.client.on('rejected', event => rejected.push(event))
    sim.clients.A!.edit(state => [splitNodeOp(state, 'p1', 5, 'private:tail')])
    sim.clients.B!.edit([insertText('p1', 11, '!')])
    await sim.deliverUp('A')
    sim.deliverDown('B')
    // Typed after "!", which the server moves into the hidden node.
    sim.clients.B!.edit([insertText('p1', 6, '?')])
    await sim.flush()
    expect(rejected).toEqual([{ reason: 'conflict', ops: [insertText('p1', 6, '?')] }])
    expect((await sim.store.range(sim.docId, 0)).map(entry => `${entry.clientId}:${entry.seq}`)).toEqual(['A:1', 'B:1'])
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
  })

  it('reloads a reconnecting peer whose missed ops need rewriting, keeping its pending edits', async () => {
    const sim = await createSimulation(doc, { server: { hooks: { redact } } })
    const conflicts: unknown[] = []
    sim.clients.B!.client.on('conflict', conflict => conflicts.push(conflict))
    sim.disconnect('B')
    sim.clients.A!.edit(state => [mergeNodeOp(state, 'private:x', 'p1')])
    sim.clients.B!.edit([{ t: 'insertNode', node: { id: 'p3', parentId: null, orderKey: 'a9', type: 'paragraph', attrs: {}, content: [{ insert: 'new' }] } }])
    sim.clients.B!.edit([insertText('p2', 0, 'B:'), insertText('p3', 3, '!')])
    await sim.flush()
    sim.reconnect('B')
    await sim.flush()
    // The in-flight transaction is sequenced as sent (same idempotency key) and the snapshot
    // includes it; the edit buffered behind it follows as the next transaction.
    expect((await sim.store.range(sim.docId, 0)).map(entry => `${entry.clientId}:${entry.seq}`)).toEqual(['A:1', 'B:1', 'B:2'])
    expect(conflicts).toEqual([])
    expect(outline(sim.clients.B!.client.state)).toEqual(['paragraph#p1: hello worldhidden', 'paragraph#p2: B:end', 'paragraph#p3: new!'])
    expect(records(sim.clients.B!.client.state)).toEqual(viewOfB(await sim.serverState()))
    expect(records(sim.clients.A!.client.state)).toEqual(records(await sim.serverState()))
  })

  it('corrects every node a concurrent entry touched (recorded fuzz seeds)', async () => {
    // These seeds moved a peer's edit into a node created by a concurrent split on its side only.
    for (const seed of [353, 740]) {
      const result = await runFuzz({ seed, clients: 8, txPerClient: 100, privateNodes: true })
      expect(result.divergence, `seed ${seed}`).toBeUndefined()
    }
  }, 60_000)

  // Scale: RSTORE_OT_REDACT_RUNS, _CLIENTS, _TX and _SEED (chunks); totals appended to RSTORE_OT_REDACT_REPORT.
  it('converges in the fuzz with nodes of one client hidden from another', async () => {
    const env = process.env
    const first = Number(env.RSTORE_OT_REDACT_SEED ?? 1)
    const totals = { runs: 0, diverged: [] as number[], transactions: 0, undos: 0, undoViolations: 0, violationSeeds: [] as number[] }
    for (let seed = first; seed < first + Number(env.RSTORE_OT_REDACT_RUNS ?? 20); seed++) {
      const result = await runFuzz({ seed, clients: Number(env.RSTORE_OT_REDACT_CLIENTS ?? 4), txPerClient: Number(env.RSTORE_OT_REDACT_TX ?? 40), privateNodes: true })
      totals.runs++
      totals.transactions += result.transactions
      totals.undos += result.undos
      totals.undoViolations += result.undoViolations
      if (result.undoViolations) {
        totals.violationSeeds.push(seed)
      }
      if (result.diverged) {
        totals.diverged.push(seed)
      }
      expect(result.divergence, `seed ${seed}`).toBeUndefined()
    }
    if (env.RSTORE_OT_REDACT_REPORT) {
      appendFileSync(env.RSTORE_OT_REDACT_REPORT, `${JSON.stringify({ clients: env.RSTORE_OT_REDACT_CLIENTS ?? 4, first, ...totals })}\n`)
    }
  }, 24 * 3600_000)
})
