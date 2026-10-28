import type { MemoryCheckpoints, MemoryMeasurement, MemoryMeasurementSummary, MemoryMetricSummary } from './types'

/** Derive signed retained-memory deltas from raw heap checkpoints. */
export function calculateMemoryMeasurement(checkpoints: MemoryCheckpoints, growthUnits: number): MemoryMeasurement {
  if (!Number.isSafeInteger(growthUnits) || growthUnits <= 0)
    throw new TypeError(`growthUnits must be a positive integer, received ${growthUnits}`)
  const growthBytes = checkpoints.growthBytes - checkpoints.steadyBytes
  return {
    checkpoints,
    setupRetainedBytes: checkpoints.setupBytes - checkpoints.baselineBytes,
    steadyRetainedBytes: checkpoints.steadyBytes - checkpoints.baselineBytes,
    growthBytes,
    growthBytesPerUnit: growthBytes / growthUnits,
    teardownResidualBytes: checkpoints.teardownBytes - checkpoints.baselineBytes,
  }
}

/** Summarize repeated measurements while preserving signed ranges. */
export function summarizeMemoryMeasurements(measurements: readonly MemoryMeasurement[]): MemoryMeasurementSummary {
  if (!measurements.length)
    throw new TypeError('Cannot summarize zero memory measurements')
  return {
    setupRetainedBytes: summarize(measurements.map(value => value.setupRetainedBytes)),
    steadyRetainedBytes: summarize(measurements.map(value => value.steadyRetainedBytes)),
    growthBytes: summarize(measurements.map(value => value.growthBytes)),
    growthBytesPerUnit: summarize(measurements.map(value => value.growthBytesPerUnit)),
    teardownResidualBytes: summarize(measurements.map(value => value.teardownResidualBytes)),
  }
}

/** Practical per-run retained-memory classification against paired legacy. */
export function classifyMemoryParity(
  candidateValues: readonly number[],
  legacyValues: readonly number[],
): 'meets target' | 'near parity' | 'misses target' {
  if (!candidateValues.length || candidateValues.length !== legacyValues.length)
    throw new TypeError('Memory parity requires equally sized paired runs')
  const candidateMedian = summarize(candidateValues).median
  const legacyMedian = summarize(legacyValues).median
  if (candidateMedian <= legacyMedian)
    return 'meets target'
  const withinTolerance = candidateValues.every((value, index) => {
    const legacy = legacyValues[index]!
    return value - legacy <= Math.max(64 * 1024, Math.abs(legacy) * 0.05)
  })
  return withinTolerance ? 'near parity' : 'misses target'
}

/** Subtract matching control readings without clamping signed noise. */
export function controlAdjustedDelta(values: readonly number[], controls: readonly number[]): number[] {
  if (!values.length || values.length !== controls.length)
    throw new TypeError('Control adjustment requires equally sized paired runs')
  return values.map((value, index) => value - controls[index]!)
}

/** Classify repeated retained growth against same-run empty-control noise. */
export function classifyRetainedGrowth(
  growthValues: readonly number[],
  controlValues: readonly number[],
): 'growth detected' | 'inconclusive' {
  if (!growthValues.length || !controlValues.length)
    throw new TypeError('Growth classification requires scenario and control measurements')
  return Math.min(...growthValues) > Math.max(...controlValues) ? 'growth detected' : 'inconclusive'
}

/** Return median plus inclusive range without clamping signed values. */
export function summarize(values: readonly number[]): MemoryMetricSummary {
  if (!values.length)
    throw new TypeError('Cannot summarize zero values')
  if (values.some(value => !Number.isFinite(value)))
    throw new TypeError('Memory summary requires finite values')
  const sorted = [...values].sort((left, right) => left - right)
  return {
    median: sorted[Math.floor(sorted.length / 2)]!,
    range: [sorted[0]!, sorted.at(-1)!],
  }
}

/** Return conservative all-pair ratio envelope for positive retained heaps. */
export function ratioEnvelope(numerators: readonly number[], denominators: readonly number[]): readonly [number, number] {
  if (numerators.some(value => value <= 0) || denominators.some(value => value <= 0))
    throw new TypeError('Retained-memory ratios require positive values')
  const ratios = numerators.flatMap(numerator => denominators.map(denominator => numerator / denominator))
  return [Math.min(...ratios), Math.max(...ratios)]
}
