import type { MemoryBenchmarkReport, MemoryBenchmarkRow } from './types'
import { classifyRetainedGrowth, summarize, summarizeMemoryMeasurements } from './report'

/** Exact identities embedded in v5/v6 memory evidence. */
export interface MemoryV6Labels {
  /** Frozen legacy SHA-256. */
  legacyHash: string
  /** Exact v5 commit. */
  dataCoreV5: string
  /** Candidate v6 label. */
  dataCoreV6: string
  /** Candidate diff SHA-256. */
  candidateDiffHash: string
}

/** Combine three same-machine v5/v6 retained-memory runs. */
export function combineMemoryV6Reports(
  dataCoreV5: readonly MemoryBenchmarkReport[],
  dataCoreV6: readonly MemoryBenchmarkReport[],
  versions: MemoryV6Labels,
): any {
  validateMemoryV6Runs(dataCoreV5, dataCoreV6, versions.legacyHash)
  const reference = dataCoreV6[0]!
  const v5Control = dataCoreV5.map(controlGrowth)
  const v6Control = dataCoreV6.map(controlGrowth)
  const rows = reference.rows.map(row => combineRow(row, dataCoreV5, dataCoreV6, v5Control, v6Control))
  return {
    generatedAt: new Date().toISOString(),
    environment: reference.environment,
    versions,
    method: { trials: 3, gcPassesPerCheckpoint: 5, informationalOnly: true },
    acceptance: {
      setupRowsMeetingGuard: rows.filter(row => row.guards.setup).length,
      steadyRowsMeetingGuard: rows.filter(row => row.guards.steady).length,
      rowCount: rows.length,
      newGrowthSignals: rows.filter(row => row.growthSignals.newSignal).map(row => row.scenarioId),
    },
    rows,
  }
}

/** Validate three runs, environment, hashes, rows, and implementations. */
export function validateMemoryV6Runs(v5: readonly MemoryBenchmarkReport[], v6: readonly MemoryBenchmarkReport[], legacyHash: string): void {
  if (v5.length !== 3 || v6.length !== 3)
    throw new TypeError('Memory v5/v6 report requires exactly three runs per version')
  const reports = [...v5, ...v6]
  const reference = reports[0]!
  const environment = environmentKey(reference)
  const rows = reference.rows.map(rowKey).join('\n')
  for (const report of reports) {
    if (environmentKey(report) !== environment)
      throw new TypeError('Memory v5/v6 environment drift detected')
    if (report.environment.legacyHash !== legacyHash)
      throw new TypeError('Memory v5/v6 legacy hash drift detected')
    if (report.rows.map(rowKey).join('\n') !== rows)
      throw new TypeError('Memory v5/v6 row or dimension drift detected')
    for (const row of report.rows) {
      if (!row.implementations.legacy || !row.implementations.engine)
        throw new TypeError(`Memory v5/v6 row ${rowKey(row)} is missing implementation data`)
    }
  }
}

/** Combine one retained-memory ownership row. */
function combineRow(
  reference: MemoryBenchmarkRow,
  v5Reports: readonly MemoryBenchmarkReport[],
  v6Reports: readonly MemoryBenchmarkReport[],
  v5Control: number[],
  v6Control: number[],
): any {
  const v5Rows = v5Reports.map(report => findRow(report, reference))
  const v6Rows = v6Reports.map(report => findRow(report, reference))
  const v5 = v5Rows.map(row => row.implementations.engine)
  const v6 = v6Rows.map(row => row.implementations.engine)
  const legacy = v6Rows.map(row => row.implementations.legacy)
  const setup = comparison(v6.map(value => value.setupRetainedBytes), v5.map(value => value.setupRetainedBytes))
  const steady = comparison(v6.map(value => value.steadyRetainedBytes), v5.map(value => value.steadyRetainedBytes))
  const v5Signal = classifyRetainedGrowth(v5.map(value => value.growthBytes), v5Control)
  const v6Signal = classifyRetainedGrowth(v6.map(value => value.growthBytes), v6Control)
  const isControl = reference.scenarioId === 'empty-control'
  return {
    scenarioId: reference.scenarioId,
    scenarioName: reference.scenarioName,
    dimensions: reference.dimensions,
    unit: reference.unit,
    warmupUnits: reference.warmupUnits,
    growthUnits: reference.growthUnits,
    summaries: {
      legacy: summarizeMemoryMeasurements(legacy),
      dataCoreV5: summarizeMemoryMeasurements(v5),
      dataCoreV6: summarizeMemoryMeasurements(v6),
    },
    comparisons: { setup, steady },
    guards: {
      setup: isControl || (setup.medianRatio == null ? setup.medianDelta <= 0 : setup.medianRatio <= 1.03 && setup.envelope[1] <= 1.08),
      steady: isControl || (steady.medianRatio == null ? steady.medianDelta <= 0 : steady.medianRatio <= 1.03 && steady.envelope[1] <= 1.08),
    },
    growthSignals: { dataCoreV5: v5Signal, dataCoreV6: v6Signal, newSignal: v5Signal === 'inconclusive' && v6Signal === 'growth detected' },
    runs: { dataCoreV5: v5Rows, dataCoreV6: v6Rows },
  }
}

/** Compare positive heaps or preserve signed absolute deltas. */
function comparison(candidate: number[], baseline: number[]): any {
  const candidateSummary = summarize(candidate)
  const baselineSummary = summarize(baseline)
  const positive = candidate.every(value => value > 0) && baseline.every(value => value > 0)
  return {
    medianRatio: positive ? candidateSummary.median / baselineSummary.median : null,
    envelope: positive ? [Math.min(...candidate) / Math.max(...baseline), Math.max(...candidate) / Math.min(...baseline)] : null,
    medianDelta: candidateSummary.median - baselineSummary.median,
  }
}

/** Find exact row. */
function findRow(report: MemoryBenchmarkReport, reference: MemoryBenchmarkRow): MemoryBenchmarkRow {
  const row = report.rows.find(value => rowKey(value) === rowKey(reference))
  if (!row)
    throw new TypeError(`Memory v5/v6 report missing row ${rowKey(reference)}`)
  return row
}

/** Read matching engine empty-control growth. */
function controlGrowth(report: MemoryBenchmarkReport): number {
  return report.rows.find(row => row.scenarioId === 'empty-control')?.implementations.engine.growthBytes ?? 0
}

/** Encode stable environment. */
function environmentKey(report: MemoryBenchmarkReport): string {
  const value = report.environment
  return `${value.node}|${value.platform}|${value.arch}|${value.profile}`
}

/** Encode row and dimensions. */
function rowKey(row: MemoryBenchmarkRow): string {
  return `${row.scenarioId}|${JSON.stringify(row.dimensions)}|${row.warmupUnits}|${row.growthUnits}`
}
