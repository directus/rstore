import type { FuzzResult } from './harness/fuzz'
import { appendFileSync } from 'node:fs'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { runFuzz } from './harness/fuzz'

/**
 * E1/E4/E10 fuzz. The unit suite runs a small sample; the gate scale is
 * `RSTORE_OT_FUZZ_RUNS=10000 RSTORE_OT_FUZZ_TX=200` (chunked across
 * processes with `RSTORE_OT_FUZZ_SEED`), with per-chunk totals appended as
 * JSON lines to `RSTORE_OT_FUZZ_REPORT`.
 */
const env = process.env
const runs = Number(env.RSTORE_OT_FUZZ_RUNS ?? 12)
const firstSeed = Number(env.RSTORE_OT_FUZZ_SEED ?? 1)
const txPerClient = Number(env.RSTORE_OT_FUZZ_TX ?? 40)
const clientCounts = (env.RSTORE_OT_FUZZ_CLIENTS ?? '3,5,8').split(',').map(Number)
const forbiddenRates = (env.RSTORE_OT_FUZZ_FORBIDDEN ?? '0,0.1').split(',').map(Number)

/** Totals over a batch of runs. */
function summarize(results: FuzzResult[]) {
  const rejected: Record<string, number> = {}
  for (const result of results) {
    for (const [reason, count] of Object.entries(result.rejected)) {
      rejected[reason] = (rejected[reason] ?? 0) + count
    }
  }
  return {
    runs: results.length,
    divergedSeeds: results.filter(result => result.diverged).map(result => result.seed),
    transactions: results.reduce((sum, result) => sum + result.transactions, 0),
    undos: results.reduce((sum, result) => sum + result.undos, 0),
    undoViolations: results.reduce((sum, result) => sum + result.undoViolations, 0),
    reconnects: results.reduce((sum, result) => sum + result.reconnects, 0),
    rejected,
  }
}

describe('oT fuzz', () => {
  for (const forbiddenRate of forbiddenRates) {
    for (const clients of clientCounts) {
      it(`converges with ${clients} clients, ${forbiddenRate * 100}% forbidden ops`, async () => {
        const results: FuzzResult[] = []
        for (let seed = firstSeed; seed < firstSeed + runs; seed++) {
          results.push(await runFuzz({ seed, clients, txPerClient, forbiddenRate }))
        }
        const summary = summarize(results)
        if (env.RSTORE_OT_FUZZ_REPORT) {
          appendFileSync(env.RSTORE_OT_FUZZ_REPORT, `${JSON.stringify({ clients, forbiddenRate, txPerClient, firstSeed, ...summary })}\n`)
        }
        expect(summary.divergedSeeds, results.find(result => result.diverged)?.divergence).toEqual([])
        expect(summary.undoViolations, results.find(result => result.violation)?.violation).toBe(0)
      }, 24 * 3600_000)
    }
  }
})
