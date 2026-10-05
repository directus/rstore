import type { DocTransaction } from '@rstore/multiplayer/ot'
import type { OpLogStore } from '@rstore/multiplayer/server'
import { compactionFloor, createMemoryOpLogStore, OpLogAppendRejected, sequenceTransaction } from '@rstore/multiplayer/server'
import { describe, expect, it } from 'vitest'
import { buildNodes } from '../ot/harness/docs'
import { insertText } from '../ot/harness/edits'

/** One keystroke transaction based on the head. */
async function type(store: OpLogStore, seq: number, options: { compactEvery?: number, appendContext?: unknown } = {}) {
  const tx: DocTransaction = { docId: 'doc', clientId: 'c', seq, baseVersion: await store.head('doc'), ops: [insertText('p1', 0, 'x')] }
  return sequenceTransaction(store, tx, options)
}

describe('op log retention', () => {
  it('keeps the last minOps entries and every entry newer than maxAgeMs', () => {
    const retention = { minOps: 10, maxAgeMs: 1_000 }
    expect(compactionFloor({ head: 100, floor: 0, firstRecentVersion: undefined }, retention)).toBe(90)
    expect(compactionFloor({ head: 100, floor: 0, firstRecentVersion: 50 }, retention)).toBe(49)
    expect(compactionFloor({ head: 100, floor: 95, firstRecentVersion: undefined }, retention)).toBe(95)
    expect(compactionFloor({ head: 5, floor: 0, firstRecentVersion: undefined }, retention)).toBe(0)
  })

  it('compacts every compactEvery versions while sequencing', async () => {
    let now = 0
    const store = createMemoryOpLogStore({ retention: { minOps: 4, maxAgeMs: 10 }, now: () => now })
    store.seed('doc', buildNodes([{ id: 'p1', content: '' }]), 0)
    for (let seq = 1; seq <= 12; seq++) {
      now = seq * 100
      await type(store, seq, { compactEvery: 6 })
    }
    // Compacted at versions 6 and 12; the last 4 entries are kept.
    expect(await store.floor('doc')).toBe(8)
    expect((await store.range('doc', 8)).map(entry => entry.version)).toEqual([9, 10, 11, 12])
    // Compacted rows lose content but retain their idempotency identity.
    expect(await store.findSubmission('doc', 'c', 2)).toMatchObject({ version: 2, ops: [] })
    expect(await sequenceTransaction(store, { docId: 'doc', clientId: 'd', seq: 1, baseVersion: 7, ops: [insertText('p1', 0, 'y')] })).toEqual({ status: 'rejected', reason: 'history-truncated', resync: true })
  })

  it('forwards private append context and maps a durable refusal to a rejection', async () => {
    const memory = createMemoryOpLogStore()
    memory.seed('doc', buildNodes([{ id: 'p1', content: '' }]), 0)
    const contexts: unknown[] = []
    const store: OpLogStore = {
      ...memory,
      append: async (docId, entry, nodes, context) => {
        contexts.push(context)
        if (context === 'revoked') {
          throw new OpLogAppendRejected('unavailable')
        }
        return memory.append(docId, entry, nodes, context)
      },
    }
    expect(await type(store, 1, { appendContext: { principal: 'u1' } })).toMatchObject({ status: 'ok' })
    expect(contexts).toEqual([{ principal: 'u1' }])
    expect(await type(store, 2, { appendContext: 'revoked' })).toEqual({ status: 'rejected', reason: 'unavailable' })
    expect(await store.head('doc')).toBe(1)
  })

  it('does not compact when the store has no compact method', async () => {
    const memory = createMemoryOpLogStore({ retention: { minOps: 0, maxAgeMs: 0 } })
    memory.seed('doc', buildNodes([{ id: 'p1', content: '' }]), 0)
    const { compact: _compact, ...store } = memory
    for (let seq = 1; seq <= 4; seq++) {
      await type(store, seq, { compactEvery: 2 })
    }
    expect(await store.floor('doc')).toBe(0)
  })
})
