import type { BenchmarkProfile } from './profiles'
import type { BenchmarkMeasurement, BenchmarkReport, BenchmarkScenarioResult } from './runner'
import process from 'node:process'

/** Create stable structured output from normalized scenario results. */
export function createBenchmarkReport(
  profile: BenchmarkProfile,
  results: readonly BenchmarkScenarioResult[],
): BenchmarkReport {
  return {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      profile: profile.name,
      timeMs: profile.time,
      maxRme: profile.maxRme,
    },
    rows: results.map(({ scenario, options, measurements, reruns }) => {
      const [legacy, engine] = measurements
      const interval = speedupInterval(legacy, engine)
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        dimensions: { items: options.items, watchers: options.watchers, ...(scenario.observer ? { observer: scenario.observer } : {}) },
        implementations: Object.fromEntries(measurements.map(measurement => [measurement.implementation, {
          meanMicroseconds: measurement.meanMicroseconds,
          operationsPerSecond: measurement.operationsPerSecond,
          rme: measurement.rme,
          samples: measurement.samples,
          batchSize: measurement.batchSize,
          counts: measurement.counts,
        }])),
        reruns,
        speedupInterval: interval,
        speedup: legacy.meanMs / engine.meanMs,
        verdict: classifyComparison(profile, measurements, interval),
      }
    }),
  }
}

/** Classify one paired comparison using retry threshold and confidence bounds. */
export function classifyComparison(
  profile: BenchmarkProfile,
  measurements: readonly [BenchmarkMeasurement, BenchmarkMeasurement],
  interval: readonly [number, number],
): BenchmarkReport['rows'][number]['verdict'] {
  if (measurements.some(measurement => measurement.rme > profile.maxRme))
    return 'noisy'
  if (interval[0] > 1)
    return 'engine faster'
  if (interval[1] < 1)
    return 'legacy faster'
  return 'no clear difference'
}

/** Compute conservative speedup bounds from independent mean margins. */
export function speedupInterval(legacy: BenchmarkMeasurement, engine: BenchmarkMeasurement): readonly [number, number] {
  const legacyLow = Math.max(0, legacy.meanMs - legacy.moeMs)
  const engineLow = Math.max(Number.EPSILON, engine.meanMs - engine.moeMs)
  return [legacyLow / (engine.meanMs + engine.moeMs), (legacy.meanMs + legacy.moeMs) / engineLow]
}
