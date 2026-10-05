import type { DocNodeRecord, DocOp } from '@rstore/multiplayer/ot'
import type { OpLogEntry, OpLogRetention, OpLogStore } from '@rstore/multiplayer/server'
import { sequenceTransaction } from '@rstore/multiplayer/server'
import { describe, expect, it } from 'vitest'

/** A store under test, plus a way to create a document in it. */
export interface OpLogStoreFixture {
  store: OpLogStore
  /** Creates a document with initial node rows at `version`. */
  seed: (docId: string, nodes: DocNodeRecord[], version?: number) => Promise<void>
  /** Sets the clock of entry times and age-based retention. */
  setNow: (now: number) => void
}

/** Creates a fresh fixture with the given retention. */
export type OpLogStoreFactory = (retention: OpLogRetention) => Promise<OpLogStoreFixture>

/** A paragraph record. */
function paragraph(id: string, text: string, docId = 'doc'): DocNodeRecord {
  return { id, docId, parentId: null, orderKey: `a${id.length}`, type: 'paragraph', attrs: { level: 1 }, content: text ? [{ insert: text, attributes: { bold: true } }] : [], deleted: false, version: 0 }
}

/** Inserts `text` at `at` in a paragraph. */
function insert(node: string, at: number, text: string): DocOp {
  return { t: 'text', node, ops: at ? [{ retain: at }, { insert: text }] : [{ insert: text }] }
}

/** Entry for a raw append. */
function entry(version: number, seq: number, ops: DocOp[] = []): OpLogEntry {
  return { version, clientId: 'c1', seq, userId: 'u1', ops, time: 1_000 }
}

/**
 * Behaviour every `OpLogStore` implementation must have, as the sequencer
 * relies on it: compare-and-set appends, ordered ranges, submissions found
 * by `(clientId, seq)`, node rows upserted with the entry, and compaction
 * that raises the floor.
 */
export function describeOpLogStoreContract(name: string, create: OpLogStoreFactory) {
  describe(`${name}: OpLogStore contract`, () => {
    it('reads an unknown document as empty', async () => {
      const { store } = await create({})
      expect(await store.head('nope')).toBe(0)
      expect(await store.floor('nope')).toBe(0)
      expect(await store.range('nope', 0)).toEqual([])
      expect(await store.loadNodes('nope')).toEqual([])
      expect(await store.findSubmission('nope', 'c1', 1)).toBeUndefined()
    })

    it('appends only the next version, with its node rows, and finds submissions', async () => {
      const { store, seed } = await create({})
      await seed('doc', [paragraph('p1', 'hello')], 0)
      const p1 = { ...paragraph('p1', 'hello!'), version: 1 }
      expect(await store.append('doc', entry(1, 1, [insert('p1', 5, '!')]), [p1])).toBe(true)
      expect(await store.append('doc', entry(1, 2), [])).toBe(false)
      expect(await store.append('doc', entry(3, 3), [])).toBe(false)
      expect(await store.head('doc')).toBe(1)
      expect(await store.loadNodes('doc')).toEqual([p1])
      const [logged] = await store.range('doc', 0)
      expect(logged).toMatchObject({ version: 1, clientId: 'c1', seq: 1, userId: 'u1', ops: [insert('p1', 5, '!')] })
      expect(await store.findSubmission('doc', 'c1', 1)).toMatchObject({ version: 1 })
      expect(await store.findSubmission('doc', 'c1', 2)).toBeUndefined()
    })

    it('upserts node rows and returns ranges in order', async () => {
      const { store, seed } = await create({})
      await seed('doc', [paragraph('p1', 'a')], 0)
      await seed('other', [paragraph('o1', 'x', 'other')], 0)
      await store.append('doc', entry(1, 1), [{ ...paragraph('p2', 'b'), version: 1 }])
      await store.append('doc', entry(2, 2), [{ ...paragraph('p1', 'a'), deleted: true, content: [], version: 2 }])
      const nodes = await store.loadNodes('doc')
      expect(nodes.map(node => [node.id, node.deleted, node.version]).sort()).toEqual([['p1', true, 2], ['p2', false, 1]])
      expect((await store.range('doc', 0)).map(item => item.version)).toEqual([1, 2])
      expect((await store.range('doc', 1)).map(item => item.version)).toEqual([2])
      expect((await store.range('doc', 0, 1)).map(item => item.version)).toEqual([1])
      expect(await store.loadNodes('other')).toEqual([paragraph('o1', 'x', 'other')])
    })

    it('scopes duplicate node ids to their document', async () => {
      const { store, seed } = await create({})
      await seed('doc', [paragraph('same', 'first')], 0)
      await seed('other', [paragraph('same', 'second', 'other')], 0)
      await store.append('doc', entry(1, 1), [{ ...paragraph('same', 'updated'), version: 1 }])
      expect(await store.loadNodes('doc')).toEqual([{ ...paragraph('same', 'updated'), version: 1 }])
      expect(await store.loadNodes('other')).toEqual([paragraph('same', 'second', 'other')])
    })

    it('sequences concurrent transactions without losing one', async () => {
      const { store, seed } = await create({})
      await seed('doc', [paragraph('p1', 'hello')], 0)
      const results = await Promise.all([
        sequenceTransaction(store, { docId: 'doc', clientId: 'A', seq: 1, baseVersion: 0, ops: [insert('p1', 0, 'a')] }),
        sequenceTransaction(store, { docId: 'doc', clientId: 'B', seq: 1, baseVersion: 0, ops: [insert('p1', 5, 'b')] }),
      ])
      expect(results.map(result => result.status)).toEqual(['ok', 'ok'])
      const [node] = await store.loadNodes('doc')
      expect(node!.content!.map(run => run.insert).join('')).toBe('ahellob')
      expect(node!.version).toBe(2)
    })

    it('compacts outside the retention window and refuses older bases', async () => {
      const { store, seed, setNow } = await create({ minOps: 2, maxAgeMs: 100 })
      if (!store.compact) {
        throw new Error('compact is required by this contract')
      }
      await seed('doc', [paragraph('p1', '')], 0)
      for (let seq = 1; seq <= 5; seq++) {
        setNow(seq * 1_000)
        await sequenceTransaction(store, { docId: 'doc', clientId: 'c1', seq, baseVersion: seq - 1, ops: [insert('p1', 0, 'x')] }, { compactEvery: 0 })
      }
      await store.compact('doc')
      expect(await store.floor('doc')).toBe(3)
      expect((await store.range('doc', 3)).map(item => item.version)).toEqual([4, 5])
      expect(await store.findSubmission('doc', 'c1', 2)).toMatchObject({ version: 2, ops: [] })
      expect(await sequenceTransaction(store, { docId: 'doc', clientId: 'c1', seq: 2, baseVersion: 5, ops: [insert('p1', 0, 'ignored')] })).toMatchObject({ status: 'duplicate', entry: { version: 2, ops: [] } })
      expect(await sequenceTransaction(store, { docId: 'doc', clientId: 'c2', seq: 1, baseVersion: 2, ops: [] })).toEqual({ status: 'rejected', reason: 'history-truncated', resync: true })
      expect(await store.head('doc')).toBe(5)
    })
  })
}
