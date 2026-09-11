import type { PayloadProfileRow } from '../benchmark/payload/types'
import { describe, expect, it } from 'vitest'
import { BENCHMARK_IMPLEMENTATIONS } from '../benchmark/entrypoint'
import { FULL_PAYLOAD_PROFILE } from '../benchmark/payload/profiles'
import { runPayloadWorkerProcess } from '../benchmark/payload/runner'

describe('payload scenarios', () => {
  it('validates every public workflow for legacy and engine at small size', async () => {
    const scenarios = [...new Map(FULL_PAYLOAD_PROFILE.rows.map(row => [row.scenario.id, row.scenario])).values()]
    for (const scenario of scenarios) {
      for (const implementation of BENCHMARK_IMPLEMENTATIONS) {
        const runtime = await scenario.build(implementation, { items: 8, fields: 3, nestedObjects: 2, arrayLength: 4, operations: 1 })
        await runtime.operate()
        runtime.releaseSource()
        await runtime.validate()
        await runtime.teardown()
      }
    }
  })

  it('spawns exposed-GC workers for control and records', async () => {
    const rows: PayloadProfileRow[] = [
      row('empty-lifecycle', 1, 0),
      row('small-write', 16, 3),
    ]
    for (const selected of rows) {
      const result = await runPayloadWorkerProcess(selected, 'engine')
      expect(result.scenarioId).toBe(selected.scenario.id)
      expect(Number.isFinite(result.measurement.cacheRetainedBytes)).toBe(true)
      expect(Number.isFinite(result.measurement.durationMs)).toBe(true)
    }
  })
})

/** Select one full-profile scenario with diagnostic dimensions. */
function row(id: string, items: number, fields: number): PayloadProfileRow {
  const scenario = FULL_PAYLOAD_PROFILE.rows.find(value => value.scenario.id === id)!.scenario
  return { scenario, dimensions: { items, fields, nestedObjects: 0, arrayLength: 0, operations: 1 } }
}
