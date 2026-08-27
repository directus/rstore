import type { TaskResult } from 'tinybench'
import type { ScenarioCounts } from '../benchmark/scenario-harness'
import { describe, expect, it } from 'vitest'
import { QUICK_PROFILE } from '../benchmark/profiles'
import { normalizeMeasurement, resolveScenarioItemCounts, speedupInterval } from '../benchmark/runner'

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
