import type { TaskResult } from 'tinybench'
import type { ScenarioCounts } from '../benchmark/scenario-harness'
import { describe, expect, it } from 'vitest'
import { QUICK_PROFILE } from '../benchmark/profiles'
import { createBenchmarkReport, normalizeMeasurement, resolveScenarioItemCounts, shouldRetryMeasurements, speedupInterval } from '../benchmark/runner'

const COUNTS: ScenarioCounts = { list: 0, item: 0, relation: 0 }

describe('benchmark runner metrics', () => {
  it('normalizes Tinybench batch values to individual operations', () => {
    const measurement = normalizeMeasurement('engine', result({ hz: 20, mean: 4, moe: 0.4 }), 8, COUNTS)
    expect(measurement.operationsPerSecond).toBe(160)
    expect(measurement.meanMicroseconds).toBe(500)
    expect(measurement.meanMs).toBe(0.5)
    expect(measurement.moeMs).toBeCloseTo(0.05)
  })

  it('returns a conclusive speedup interval when margins do not overlap', () => {
    const legacy = normalizeMeasurement('legacy', result({ mean: 10, moe: 1 }), 1, COUNTS)
    const engine = normalizeMeasurement('engine', result({ mean: 2, moe: 0.1 }), 1, COUNTS)
    expect(speedupInterval(legacy, engine)).toEqual([4.285714285714286, 5.7894736842105265])
  })

  it('preserves an overlapping interval for noisy or equivalent work', () => {
    const legacy = normalizeMeasurement('legacy', result({ mean: 2, moe: 1 }), 1, COUNTS)
    const engine = normalizeMeasurement('engine', result({ mean: 2, moe: 1 }), 1, COUNTS)
    const [lower, upper] = speedupInterval(legacy, engine)
    expect(lower).toBeLessThan(1)
    expect(upper).toBeGreaterThan(1)
  })

  it('prefers scenario item counts over profile defaults', () => {
    const inherited = QUICK_PROFILE.scenarios[0]!
    const focused = { ...inherited, itemCounts: [1000] }

    expect(resolveScenarioItemCounts(QUICK_PROFILE, inherited)).toBe(QUICK_PROFILE.itemCounts)
    expect(resolveScenarioItemCounts(QUICK_PROFILE, focused)).toBe(focused.itemCounts)
  })

  it('keeps every known regression workload in the quick profile', () => {
    expect(QUICK_PROFILE.scenarios.map(scenario => scenario.id)).toEqual(expect.arrayContaining([
      'layer-field-read',
      'item-read',
      'composite-index-membership-write',
    ]))
  })

  it('creates stable structured benchmark reports', () => {
    const legacy = normalizeMeasurement('legacy', result({ mean: 2, moe: 0.1, rme: 2 }), 1, COUNTS)
    const engine = normalizeMeasurement('engine', result({ mean: 1, moe: 0.05, rme: 3 }), 1, COUNTS)
    const report = createBenchmarkReport(QUICK_PROFILE, [{
      scenario: QUICK_PROFILE.scenarios[0]!,
      options: { items: 1000, watchers: 20 },
      measurements: [legacy, engine],
      reruns: 1,
    }])

    expect(report.environment.node).toBe(process.version)
    expect(report.rows[0]).toMatchObject({
      scenarioId: 'field-write-list-watchers',
      dimensions: { items: 1000, watchers: 20, observer: 'list' },
      reruns: 1,
      verdict: 'engine faster',
    })
    expect(report.rows[0]!.implementations.engine).toMatchObject({
      meanMicroseconds: 1000,
      rme: 3,
      samples: 2,
    })
    expect(report.rows[0]!.speedupInterval).toHaveLength(2)
  })

  it('retries only when one measurement exceeds configured RME', () => {
    const stable = normalizeMeasurement('legacy', result({ rme: QUICK_PROFILE.maxRme }), 1, COUNTS)
    const noisy = normalizeMeasurement('engine', result({ rme: QUICK_PROFILE.maxRme + 0.01 }), 1, COUNTS)

    expect(shouldRetryMeasurements(QUICK_PROFILE, [stable])).toBe(false)
    expect(shouldRetryMeasurements(QUICK_PROFILE, [stable, noisy])).toBe(true)
  })
})

/** Build the Tinybench fields used by metric normalization. */
function result(overrides: Partial<TaskResult>): TaskResult {
  return {
    totalTime: 1,
    min: 1,
    max: 1,
    hz: 1,
    period: 1,
    samples: [1, 1],
    mean: 1,
    variance: 0,
    sd: 0,
    sem: 0,
    df: 1,
    critical: 1,
    moe: 0,
    rme: 0,
    p75: 1,
    p99: 1,
    p995: 1,
    p999: 1,
    ...overrides,
  }
}
