import type { PayloadCheckpoints, PayloadControlAdjustedMeasurement, PayloadMeasurement, PayloadMetricSummary } from './types'

/** Derive signed lifecycle metrics from raw payload checkpoints. */
export function calculatePayloadMeasurement(
  checkpoints: PayloadCheckpoints,
  durationMs: number,
): PayloadMeasurement {
  return {
    checkpoints,
    durationMs,
    inputRetainedBytes: checkpoints.inputHeapBytes - checkpoints.moduleHeapBytes,
    cacheRetainedBytes: checkpoints.retainedHeapBytes - checkpoints.moduleHeapBytes,
    peakRssDeltaBytes: checkpoints.rssAfterBytes - checkpoints.rssBeforeBytes,
    teardownResidualBytes: checkpoints.teardownHeapBytes - checkpoints.moduleHeapBytes,
  }
}

/** Subtract one matching lifecycle or input-only control without clamping. */
export function subtractPayloadControl(
  measurement: PayloadMeasurement,
  control: PayloadMeasurement,
): PayloadControlAdjustedMeasurement {
  return {
    durationMs: measurement.durationMs - control.durationMs,
    cacheRetainedBytes: measurement.cacheRetainedBytes - control.cacheRetainedBytes,
    peakRssDeltaBytes: measurement.peakRssDeltaBytes - control.peakRssDeltaBytes,
    teardownResidualBytes: measurement.teardownResidualBytes - control.teardownResidualBytes,
  }
}

/** Summarize one non-empty metric sample with median and inclusive range. */
export function summarizeMetric(values: readonly number[]): PayloadMetricSummary {
  if (!values.length)
    throw new TypeError('Payload metric summary requires at least one value')
  if (values.some(value => !Number.isFinite(value)))
    throw new TypeError('Payload metric summary requires finite values')
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
  return { median, range: [sorted[0]!, sorted.at(-1)!] }
}

/** Calculate geometric mean for positive finite ratios. */
export function geometricMean(values: readonly number[]): number {
  if (!values.length || values.some(value => !Number.isFinite(value) || value <= 0))
    throw new TypeError('Geometric mean requires positive finite values')
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
}
