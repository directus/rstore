import type { DocState } from '@rstore/multiplayer/ot'
import type { DocOpType } from './harness/randomOps'
import { appendFileSync } from 'node:fs'
import process from 'node:process'
import { clearPendingState, isNodeVisible, loadPendingState, OtValidationError, savePendingState } from '@rstore/multiplayer/ot'
import { createMemoryOpLogStore } from '@rstore/multiplayer/server'
import { describe, expect, it } from 'vitest'
import { outline, records } from './harness/docs'
import { insertText } from './harness/edits'
import { seededRandom } from './harness/random'
import { randomDocOp } from './harness/randomOps'
import { createSimulation } from './harness/simulation'

const env = process.env
/** E6 runs; the gate uses 1 000 transactions per side and reports p95 over the runs. */
const runs = Number(env.RSTORE_OT_OFFLINE_RUNS ?? 3)
const txPerSide = Number(env.RSTORE_OT_OFFLINE_TX ?? 300)
const doc = [
  { id: 'p1', content: 'hello world' },
  { id: 'p2', content: 'second line' },
  { id: 'p3', content: 'third line' },
]
const OP_TYPES: DocOpType[] = ['text', 'text', 'text', 'text', 'text', 'text', 'splitNode', 'mergeNode', 'insertNode', 'deleteNode', 'setAttrs']

/** Visible units authored by `author` (`a` mark). */
function authoredChars(state: DocState, author: string): number {
  let count = 0
  for (const node of state.nodes.values()) {
    if (node.content && isNodeVisible(state, node.id)) {
      for (const run of node.content) {
        if (run.attributes?.a === author) {
          count += typeof run.insert === 'string' ? run.insert.length : 1
        }
      }
    }
  }
  return count
}

/** `count` random valid edits by one client, authored with its name as mark. */
function randomEdits(sim: Awaited<ReturnType<typeof createSimulation>>, name: string, count: number, seed: number) {
  const random = seededRandom(seed)
  const { client } = sim.clients[name]!
  for (let made = 0, step = 0; made < count; step++) {
    const op = randomDocOp(random, client.state, random.pick(OP_TYPES), `${name}-${seed}-${step}-`, { marks: { a: name }, visibleOnly: true })
    try {
      if (op) {
        client.submit([op])
        made++
      }
    }
    catch (error) {
      if (!(error instanceof OtValidationError)) {
        throw error
      }
    }
  }
}

describe('e6 offline divergence', () => {
  it(`converges after ${txPerSide} offline transactions against ${txPerSide} online ones`, async () => {
    const durations: number[] = []
    const kept: Array<[number, number]> = []
    for (let run = 0; run < runs; run++) {
      const sim = await createSimulation(doc, { clients: ['off', 'c1', 'c2', 'c3'] })
      sim.disconnect('off')
      randomEdits(sim, 'off', txPerSide, run * 10 + 1)
      for (let i = 0; i < 3; i++) {
        randomEdits(sim, `c${i + 1}`, Math.ceil(txPerSide / 3), run * 10 + 2 + i)
        await sim.flush()
      }
      const before = authoredChars(sim.clients.off!.client.state, 'off')
      const start = performance.now()
      sim.reconnect('off')
      await sim.flush()
      durations.push(performance.now() - start)
      const server = await sim.serverState()
      for (const { client } of Object.values(sim.clients)) {
        expect(records(client.state)).toEqual(records(server))
      }
      // The normal path rebases: offline text survives unless others deleted
      // the nodes it was typed in, or a conflicting op was dropped.
      kept.push([before, authoredChars(server, 'off')])
      expect(authoredChars(server, 'off')).toBeGreaterThan(0)
    }
    durations.sort((a, b) => a - b)
    const p95 = durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)]!
    if (env.RSTORE_OT_OFFLINE_REPORT) {
      appendFileSync(env.RSTORE_OT_OFFLINE_REPORT, `${JSON.stringify({ kind: 'rebase', runs, txPerSide, p95, max: durations.at(-1), median: durations[Math.floor(durations.length / 2)], offlineCharsBeforeAfter: kept })}\n`)
    }
    expect(p95).toBeLessThan(2000)
  }, 3600_000)

  it('loses no offline text when the history was truncated (conflict copies)', async () => {
    for (let run = 0; run < runs; run++) {
      let now = 0
      const store = createMemoryOpLogStore({ retention: { minOps: 0, maxAgeMs: 1000 }, now: () => now })
      const sim = await createSimulation(doc, { clients: ['off', 'c1', 'c2', 'c3'], store })
      sim.disconnect('off')
      randomEdits(sim, 'off', txPerSide, run * 10 + 5)
      for (let i = 0; i < 3; i++) {
        randomEdits(sim, `c${i + 1}`, Math.ceil(txPerSide / 3), run * 10 + 6 + i)
        await sim.flush()
      }
      now += 2000
      store.compact(sim.docId)
      const before = authoredChars(sim.clients.off!.client.state, 'off')
      sim.reconnect('off')
      await sim.flush()
      const server = await sim.serverState()
      for (const { client } of Object.values(sim.clients)) {
        expect(records(client.state)).toEqual(records(server))
      }
      expect(authoredChars(server, 'off')).toBeGreaterThanOrEqual(before)
      if (env.RSTORE_OT_OFFLINE_REPORT) {
        const copies = [...server.nodes.values()].filter(node => node.attrs.conflictOf && !node.deleted).length
        appendFileSync(env.RSTORE_OT_OFFLINE_REPORT, `${JSON.stringify({ kind: 'truncated', run, txPerSide, before, after: authoredChars(server, 'off'), copies })}\n`)
      }
    }
  }, 3600_000)

  it('makes a conflict copy for overlapping edits and merges the rest', async () => {
    let now = 0
    const store = createMemoryOpLogStore({ retention: { minOps: 0, maxAgeMs: 1000 }, now: () => now })
    const sim = await createSimulation(doc, { clients: ['off', 'on'], store })
    sim.disconnect('off')
    sim.clients.off!.edit([{ t: 'text', node: 'p1', ops: [{ retain: 6 }, { insert: 'big', attributes: { bold: true } }, { delete: 5 }] }])
    sim.clients.off!.edit([insertText('p2', 0, '> ')])
    sim.clients.on!.edit([{ t: 'text', node: 'p1', ops: [{ retain: 6 }, { insert: 'small' }, { delete: 5 }] }])
    sim.clients.on!.edit([insertText('p2', 11, '!')])
    await sim.flush()
    now += 2000
    store.compact(sim.docId)
    const conflicts: unknown[] = []
    sim.clients.off!.client.on('conflict', conflict => conflicts.push(conflict))
    sim.reconnect('off')
    await sim.flush()
    expect(outline(await sim.serverState())).toEqual([
      'paragraph#p1: hello small',
      'paragraph#p1~conflict-off {"conflictOf":"p1"}: hello {big|bold}',
      'paragraph#p2: > second line!',
      'paragraph#p3: third line',
    ])
    expect(conflicts).toEqual([{ nodeId: 'p1', copyId: 'p1~conflict-off' }])
  })

  it('persists pending edits and resumes them after a reload', async () => {
    const sim = await createSimulation(doc, { clients: ['off', 'on'] })
    sim.disconnect('off')
    sim.clients.off!.edit([insertText('p1', 0, 'offline ')])
    const data = new Map<string, unknown>()
    const storage = { get: async (key: string) => data.get(key), set: async (key: string, value: unknown) => void data.set(key, value), delete: async (key: string) => void data.delete(key) }
    await savePendingState(storage, sim.docId, sim.clients.off!.client.pending)
    const restored = await loadPendingState(storage, sim.docId)
    const reloaded = await createSimulation(doc, { clients: ['off'], store: sim.store, seed: false, client: { restore: restored! } })
    await reloaded.flush()
    expect(outline(await reloaded.serverState())).toEqual(['paragraph#p1: offline hello world', 'paragraph#p2: second line', 'paragraph#p3: third line'])
  })

  it('partitions pending edits and clears corrupt or revoked state', async () => {
    const sim = await createSimulation(doc, { clients: ['off'] })
    sim.disconnect('off')
    sim.clients.off!.edit([insertText('p1', 0, 'offline ')])
    const data = new Map<string, unknown>()
    const storage = { get: async (key: string) => data.get(key), set: async (key: string, value: unknown) => void data.set(key, value), delete: async (key: string) => void data.delete(key) }
    await savePendingState(storage, sim.docId, sim.clients.off!.client.pending, { scope: 'tenant-a:user-a:protocol-2:web' })
    expect(await loadPendingState(storage, sim.docId, { scope: 'tenant-a:user-b:protocol-2:web' })).toBeNull()
    await clearPendingState(storage, sim.docId, { scope: 'tenant-a:user-a:protocol-2:web' })
    expect(await loadPendingState(storage, sim.docId, { scope: 'tenant-a:user-a:protocol-2:web' })).toBeNull()
    data.set('rstore:ot:pending:tenant-a:user-a:protocol-2:web:doc', { nope: true })
    expect(await loadPendingState(storage, 'doc', { scope: 'tenant-a:user-a:protocol-2:web' })).toBeNull()
    expect(data.has('rstore:ot:pending:tenant-a:user-a:protocol-2:web:doc')).toBe(false)
  })
})
