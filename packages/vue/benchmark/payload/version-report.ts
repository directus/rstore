import type { PayloadBenchmarkReport, PayloadBenchmarkRow, PayloadMeasurement } from './types'
import { geometricMean, subtractPayloadControl, summarizeMetric } from './report'

/** Exact identities embedded in v5/v6 payload evidence. */
export interface PayloadVersionLabels {
  /** Frozen legacy SHA-256. */
  legacyHash: string
  /** Exact Data Core v5 commit. */
  dataCoreV5: string
  /** Data Core v6 candidate label. */
  dataCoreV6: string
  /** SHA-256 of candidate diff. */
  candidateDiffHash: string
}

/** Five full reports for each compared Data Core version. */
export interface PayloadVersionRuns {
  /** Exact v5 reports. */
  dataCoreV5: PayloadBenchmarkReport[]
  /** Candidate v6 reports. */
  dataCoreV6: PayloadBenchmarkReport[]
}

/** Combine five same-machine payload trials into informational evidence. */
export function combinePayloadVersionReports(runs: PayloadVersionRuns, versions: PayloadVersionLabels): any {
  validatePayloadVersionRuns(runs, versions.legacyHash)
  const reference = runs.dataCoreV6[0]!
  const rows = reference.rows.map(row => combineRow(row, runs))
  const large = rows.filter(row => row.large)
  const durationRatios = large.map(row => row.comparisons.duration.medianRatio)
  const rssRatios = large.map(row => row.comparisons.peakRssDelta.medianRatio).filter(isNumber)
  const aggregate = {
    durationGeometricMeanRatio: geometricMean(durationRatios),
    peakRssGeometricMeanRatio: rssRatios.length === large.length ? geometricMean(rssRatios) : null,
    peakRssClassification: rssRatios.length === large.length ? 'ratio available' : 'inconclusive zero crossing',
    everyDurationWithinFivePercent: large.every(row => row.acceptance.duration),
    everyPeakRssWithinFivePercent: large.every(row => row.acceptance.peakRss === true),
    everyRetainedBelowV5: large.every(row => row.acceptance.retainedBelowV5),
    everyRetainedAtLegacyParity: large.every(row => row.acceptance.retainedAtLegacyParity),
  }
  return {
    generatedAt: new Date().toISOString(),
    environment: reference.environment,
    versions,
    method: {
      trials: 5,
      gcPassesPerCheckpoint: 5,
      operationInputConstructedOutsideTimedRegion: true,
      informationalOnly: true,
    },
    aggregate,
    rows,
  }
}

/** Validate run counts, environment, dimensions, hashes, and implementations. */
export function validatePayloadVersionRuns(runs: PayloadVersionRuns, legacyHash: string): void {
  if (runs.dataCoreV5.length !== 5 || runs.dataCoreV6.length !== 5)
    throw new TypeError('Payload version report requires exactly five runs per version')
  const reports = [...runs.dataCoreV5, ...runs.dataCoreV6]
  const reference = reports[0]
  if (!reference)
    throw new TypeError('Payload version report contains no runs')
  const environment = environmentKey(reference)
  const rows = reference.rows.map(rowKey).join('\n')
  for (const report of reports) {
    if (environmentKey(report) !== environment)
      throw new TypeError('Payload benchmark environment drift detected')
    if (report.environment.legacyHash !== legacyHash)
      throw new TypeError('Payload benchmark legacy hash drift detected')
    if (report.rows.map(rowKey).join('\n') !== rows)
      throw new TypeError('Payload benchmark row or dimension drift detected')
    for (const row of report.rows) {
      if (!row.implementations.legacy || !row.implementations.engine)
        throw new TypeError(`Payload benchmark row ${rowKey(row)} is missing implementation data`)
    }
  }
}

/** Combine one stable row across both versions. */
function combineRow(reference: PayloadBenchmarkRow, runs: PayloadVersionRuns): any {
  const v5Rows = runs.dataCoreV5.map(report => findRow(report, reference))
  const v6Rows = runs.dataCoreV6.map(report => findRow(report, reference))
  const v5 = v5Rows.map(row => row.implementations.engine)
  const v6 = v6Rows.map(row => row.implementations.engine)
  const legacy = v6Rows.map(row => row.implementations.legacy)
  const duration = comparison(v6.map(value => value.durationMs), v5.map(value => value.durationMs))
  const peakRss = comparison(v6.map(value => value.peakRssDeltaBytes), v5.map(value => value.peakRssDeltaBytes))
  const retained = comparison(v6.map(value => value.cacheRetainedBytes), v5.map(value => value.cacheRetainedBytes))
  const retainedLegacy = comparison(v6.map(value => value.cacheRetainedBytes), legacy.map(value => value.cacheRetainedBytes))
  const adjustedV5 = v5Rows.map((_, index) => subtractPayloadControl(v5[index]!, matchingControl(runs.dataCoreV5[index]!, reference, 'engine')))
  const adjustedV6 = v6Rows.map((_, index) => subtractPayloadControl(v6[index]!, matchingControl(runs.dataCoreV6[index]!, reference, 'engine')))
  const adjustedLegacy = v6Rows.map((_, index) => subtractPayloadControl(legacy[index]!, matchingControl(runs.dataCoreV6[index]!, reference, 'legacy')))
  return {
    scenarioId: reference.scenarioId,
    scenarioName: reference.scenarioName,
    large: reference.large,
    dimensions: reference.dimensions,
    sourceBytes: reference.sourceBytes,
    summaries: {
      legacy: summarizeMeasurements(legacy),
      dataCoreV5: summarizeMeasurements(v5),
      dataCoreV6: summarizeMeasurements(v6),
    },
    controlAdjusted: {
      legacy: summarizeAdjusted(adjustedLegacy),
      dataCoreV5: summarizeAdjusted(adjustedV5),
      dataCoreV6: summarizeAdjusted(adjustedV6),
      comparisons: {
        duration: comparison(adjustedV6.map(value => value.durationMs), adjustedV5.map(value => value.durationMs)),
        peakRssDelta: comparison(adjustedV6.map(value => value.peakRssDeltaBytes), adjustedV5.map(value => value.peakRssDeltaBytes)),
        retainedHeap: comparison(adjustedV6.map(value => value.cacheRetainedBytes), adjustedV5.map(value => value.cacheRetainedBytes)),
      },
    },
    comparisons: { duration, peakRssDelta: peakRss, retainedHeap: retained, retainedHeapVsLegacy: retainedLegacy },
    acceptance: {
      duration: duration.medianRatio <= 1.05,
      peakRss: peakRss.medianRatio == null ? 'inconclusive' : peakRss.medianRatio <= 1.05,
      retainedBelowV5: retained.medianDelta < 0,
      retainedAtLegacyParity: retainedLegacy.medianRatio != null
        ? retainedLegacy.medianRatio <= 1 && retainedLegacy.envelope?.[1] <= 1.05
        : retainedLegacy.medianDelta <= 0,
    },
    runs: { dataCoreV5: v5Rows, dataCoreV6: v6Rows },
  }
}

/** Summarize signed metrics after paired control subtraction. */
function summarizeAdjusted(values: ReturnType<typeof subtractPayloadControl>[]): any {
  return {
    durationMs: summarizeMetric(values.map(value => value.durationMs)),
    cacheRetainedBytes: summarizeMetric(values.map(value => value.cacheRetainedBytes)),
    peakRssDeltaBytes: summarizeMetric(values.map(value => value.peakRssDeltaBytes)),
    teardownResidualBytes: summarizeMetric(values.map(value => value.teardownResidualBytes)),
  }
}

/** Select exact-dimension input control when available, else empty lifecycle. */
function matchingControl(
  report: PayloadBenchmarkReport,
  reference: PayloadBenchmarkRow,
  implementation: 'legacy' | 'engine',
): PayloadMeasurement {
  const input = reference.scenarioId !== 'input-only-wide'
    ? report.rows.find(row => row.scenarioId === 'input-only-wide' && JSON.stringify(row.dimensions) === JSON.stringify(reference.dimensions))
    : undefined
  const control = input ?? report.rows.find(row => row.scenarioId === 'empty-lifecycle')
  if (!control)
    throw new TypeError(`Payload report lacks matching control for ${reference.scenarioId}`)
  return control.implementations[implementation]
}

/** Summarize every payload metric. */
function summarizeMeasurements(values: PayloadMeasurement[]): any {
  return {
    durationMs: summarizeMetric(values.map(value => value.durationMs)),
    inputRetainedBytes: summarizeMetric(values.map(value => value.inputRetainedBytes)),
    cacheRetainedBytes: summarizeMetric(values.map(value => value.cacheRetainedBytes)),
    peakRssDeltaBytes: summarizeMetric(values.map(value => value.peakRssDeltaBytes)),
    teardownResidualBytes: summarizeMetric(values.map(value => value.teardownResidualBytes)),
  }
}

/** Compare lower-is-better samples while preserving zero-crossing deltas. */
function comparison(candidate: number[], baseline: number[]): any {
  const candidateSummary = summarizeMetric(candidate)
  const baselineSummary = summarizeMetric(baseline)
  const positive = candidate.every(value => value > 0) && baseline.every(value => value > 0)
  return {
    medianRatio: positive ? candidateSummary.median / baselineSummary.median : null,
    envelope: positive ? [Math.min(...candidate) / Math.max(...baseline), Math.max(...candidate) / Math.min(...baseline)] : null,
    medianDelta: candidateSummary.median - baselineSummary.median,
    deltaRange: [Math.min(...candidate) - Math.max(...baseline), Math.max(...candidate) - Math.min(...baseline)],
  }
}

/** Find matching stable row. */
function findRow(report: PayloadBenchmarkReport, reference: PayloadBenchmarkRow): PayloadBenchmarkRow {
  const row = report.rows.find(value => rowKey(value) === rowKey(reference))
  if (!row)
    throw new TypeError(`Payload report missing row ${rowKey(reference)}`)
  return row
}

/** Encode environment excluding profile label. */
function environmentKey(report: PayloadBenchmarkReport): string {
  return `${report.environment.node}|${report.environment.platform}|${report.environment.arch}|${report.environment.profile}`
}

/** Encode stable row dimensions. */
function rowKey(row: PayloadBenchmarkRow): string {
  return `${row.scenarioId}|${JSON.stringify(row.dimensions)}|${row.sourceBytes}`
}

/** Narrow nullable numeric ratio. */
function isNumber(value: number | null): value is number {
  return typeof value === 'number'
}
