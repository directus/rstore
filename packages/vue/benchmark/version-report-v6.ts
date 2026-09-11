import type { BenchmarkReport } from './runner'

/** Exact identities embedded in v5/v6 CPU evidence. */
export interface V6VersionLabels {
  /** Exact v5 commit. */
  dataCoreV5: string
  /** Candidate v6 label. */
  dataCoreV6: string
  /** Candidate diff SHA-256. */
  candidateDiffHash: string
  /** Frozen legacy fixture SHA-256. */
  legacyHash: string
}

/** Combine three same-machine full CPU runs for v5 and v6. */
export function combineV6VersionReports(
  dataCoreV5: readonly BenchmarkReport[],
  dataCoreV6: readonly BenchmarkReport[],
  versions: V6VersionLabels,
): any {
  validateCpuRuns(dataCoreV5, dataCoreV6)
  const reference = dataCoreV6[0]!
  const rows = reference.rows.map(row => combineRow(row, dataCoreV5, dataCoreV6))
  return {
    generatedAt: new Date().toISOString(),
    environment: reference.environment,
    versions,
    method: { trials: 3, medianLimit: 1.05, conservativeAllRunLimit: 1.10, informationalOnly: true },
    acceptance: {
      rowsMeetingTarget: rows.filter(row => row.acceptance === 'meets target').length,
      rowCount: rows.length,
      allRowsMeetTarget: rows.every(row => row.acceptance === 'meets target'),
    },
    rows,
  }
}

/** Validate count, environment, row identity, and implementation payloads. */
export function validateCpuRuns(v5: readonly BenchmarkReport[], v6: readonly BenchmarkReport[]): void {
  if (v5.length !== 3 || v6.length !== 3)
    throw new TypeError('CPU v5/v6 report requires exactly three runs per version')
  const reports = [...v5, ...v6]
  const reference = reports[0]!
  const environment = environmentKey(reference)
  const rows = reference.rows.map(rowKey).join('\n')
  for (const report of reports) {
    if (environmentKey(report) !== environment)
      throw new TypeError('CPU benchmark environment drift detected')
    if (report.rows.map(rowKey).join('\n') !== rows)
      throw new TypeError('CPU benchmark row or dimension drift detected')
    for (const row of report.rows) {
      if (!row.implementations.legacy || !row.implementations.engine)
        throw new TypeError(`CPU benchmark row ${rowKey(row)} is missing implementation data`)
    }
  }
}

/** Combine one CPU row with lower-is-better ratio envelopes. */
function combineRow(reference: BenchmarkReport['rows'][number], v5Reports: readonly BenchmarkReport[], v6Reports: readonly BenchmarkReport[]): any {
  const v5 = v5Reports.map(report => findRow(report, reference))
  const v6 = v6Reports.map(report => findRow(report, reference))
  const v5Means = v5.map(row => row.implementations.engine!.meanMicroseconds)
  const v6Means = v6.map(row => row.implementations.engine!.meanMicroseconds)
  const legacyMeans = v6.map(row => row.implementations.legacy!.meanMicroseconds)
  const medianRatio = median(v6Means) / median(v5Means)
  const envelope: [number, number] = [Math.min(...v6Means) / Math.max(...v5Means), Math.max(...v6Means) / Math.min(...v5Means)]
  return {
    scenarioId: reference.scenarioId,
    scenarioName: reference.scenarioName,
    dimensions: reference.dimensions,
    medians: {
      legacyMicroseconds: median(legacyMeans),
      dataCoreV5Microseconds: median(v5Means),
      dataCoreV6Microseconds: median(v6Means),
    },
    performanceRatio: medianRatio,
    performanceEnvelope: envelope,
    acceptance: medianRatio <= 1.05 && envelope[1] <= 1.10 ? 'meets target' : 'misses target',
    runs: { dataCoreV5: v5, dataCoreV6: v6 },
  }
}

/** Find one exact row. */
function findRow(report: BenchmarkReport, reference: BenchmarkReport['rows'][number]): BenchmarkReport['rows'][number] {
  const row = report.rows.find(value => rowKey(value) === rowKey(reference))
  if (!row)
    throw new TypeError(`CPU report missing row ${rowKey(reference)}`)
  return row
}

/** Encode stable environment. */
function environmentKey(report: BenchmarkReport): string {
  const value = report.environment
  return `${value.node}|${value.platform}|${value.arch}|${value.profile}|${value.timeMs}|${value.maxRme}`
}

/** Encode row dimensions. */
function rowKey(row: BenchmarkReport['rows'][number]): string {
  return `${row.scenarioId}|${JSON.stringify(row.dimensions)}`
}

/** Return median of odd three-run sample. */
function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!
}
