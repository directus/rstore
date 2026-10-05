import type { DocOp } from '@rstore/multiplayer/ot'
import { appendFileSync } from 'node:fs'
import process from 'node:process'
import { createCollabClient } from '@rstore/multiplayer/ot'
import { createMemoryOpLogStore, sequenceTransaction } from '@rstore/multiplayer/server'
import { describe, expect, it } from 'vitest'
import { buildNodes } from './harness/docs'
import { measureKeystrokeFrames } from './harness/wireSize'

/**
 * E7/E8 measurements. Timing depends on the machine, so they only run with
 * `RSTORE_OT_PERF=1` (numbers appended to `RSTORE_OT_PERF_REPORT`).
 */
const enabled = !!process.env.RSTORE_OT_PERF
const report = (data: Record<string, unknown>) => process.env.RSTORE_OT_PERF_REPORT && appendFileSync(process.env.RSTORE_OT_PERF_REPORT, `${JSON.stringify(data)}\n`)
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)]!

describe.runIf(enabled)('performance gates (E7, E8)', () => {
  it('transforms and applies one remote tx against 100 pending ops on a 10 000-character node (E7)', () => {
    const big = 'lorem ipsum '.repeat(834).slice(0, 10_000)
    const nodes = buildNodes([{ id: 'big', content: big }, { id: 'other', content: 'x' }])
    const timings: number[] = []
    for (let sample = 0; sample < 1000; sample++) {
      const client = createCollabClient({ docId: 'doc', clientId: 'me', send: () => {}, initial: { version: 0, nodes } })
      client.connect()
      // Text ops on the big node interleaved with attribute changes, so the
      // buffer cannot fold them: 100 pending ops (1 in flight + 99 buffered).
      for (let i = 0; i < 100; i++) {
        client.submit([i % 2 === 0
          ? { t: 'text', node: 'big', ops: [{ retain: 1 + (i * 97) % 9_000 }, { insert: 'ab' }] }
          : { t: 'setAttrs', node: 'big', attrs: { n: i } }])
      }
      const remote: DocOp[] = [{ t: 'text', node: 'big', ops: [{ retain: 5_000 }, { insert: 'remote' }, { delete: 3 }] }]
      const start = performance.now()
      client.receive({ type: 'collab:ops', docId: 'doc', version: 1, clientId: 'other', ops: remote })
      timings.push(performance.now() - start)
    }
    const p95 = percentile(timings, 0.95)
    report({ kind: 'E7-client', samples: timings.length, p50: percentile(timings, 0.5), p95 })
    expect(p95).toBeLessThan(1)
  })

  it('sequences one document fast enough on the in-memory op log (E7)', async () => {
    const store = createMemoryOpLogStore()
    store.seed('doc', buildNodes([{ id: 'p1', content: 'hello world' }]), 0)
    const count = 5_000
    const start = performance.now()
    for (let seq = 1; seq <= count; seq++) {
      // Every transaction is one version behind: each one is rebased once.
      const head = await store.head('doc')
      await sequenceTransaction(store, { docId: 'doc', clientId: `c${seq % 2}`, seq, baseVersion: Math.max(0, head - 1), ops: [{ t: 'text', node: 'p1', ops: [{ retain: 3 }, { insert: 'x' }] }] })
    }
    const perSecond = count / ((performance.now() - start) / 1000)
    report({ kind: 'E7-server', transactions: count, perSecond })
    expect(perSecond).toBeGreaterThan(2_000)
  })

  it('keeps keystroke frames small (E8)', async () => {
    const report8 = await measureKeystrokeFrames()
    report({ kind: 'E8', ...report8 })
    expect(report8.ot.submit.median).toBeLessThanOrEqual(200)
    expect(report8.ot.ops.median).toBeLessThanOrEqual(200)
    // Yjs baseline: JSON frames are ~5x the binary updates raw; with
    // permessage-deflate (context takeover) both shrink to ~10-16 bytes.
    for (const trace of Object.values(report8.traces)) {
      expect((trace as { ratio: { deflated: number } }).ratio.deflated).toBeLessThanOrEqual(2)
    }
  })
})
