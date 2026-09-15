import type { MemoryBenchmarkReport, MemoryBenchmarkRow, MemoryMeasurement } from './types'
import { classifyMemoryParity, classifyRetainedGrowth, controlAdjustedDelta, ratioEnvelope, summarize, summarizeMemoryMeasurements } from './report'

/** Immutable identities embedded in retained-memory evidence. */
export interface MemoryVersionLabels {
  /** Frozen legacy fixture SHA-256. */
  legacyHash: string
  /** Data Core v1 commit. */
  dataCoreV1: string
  /** Data Core v2 commit. */
  dataCoreV2: string
  /** Data Core v3 commit. */
  dataCoreV3: string
  /** Data Core v4 candidate identity. */
  dataCoreV4: string
  /** Data Core v5 candidate identity. */
  dataCoreV5: string
  /** SHA-256 of uncommitted candidate diff. */
  candidateDiffHash: string
}

/** Three paired reports for every Data Core version. */
export interface MemoryVersionRuns {
  /** Data Core v1 paired runs. */
  dataCoreV1: MemoryBenchmarkReport[]
  /** Data Core v2 paired runs. */
  dataCoreV2: MemoryBenchmarkReport[]
  /** Data Core v3 paired runs. */
  dataCoreV3: MemoryBenchmarkReport[]
  /** Data Core v4 paired runs. */
  dataCoreV4: MemoryBenchmarkReport[]
  /** Data Core v5 paired runs. */
  dataCoreV5: MemoryBenchmarkReport[]
}

type VersionKey = keyof MemoryVersionRuns

/** Combine same-machine retained-memory runs into five-implementation evidence. */
export function combineMemoryVersionReports(runs: MemoryVersionRuns, versions: MemoryVersionLabels): any {
  validateVersionRuns(runs, versions.legacyHash)
  const reference = runs.dataCoreV5[0]!
  return {
    generatedAt: new Date().toISOString(),
    environment: reference.environment,
    versions,
    method: {
      gcPassesPerCheckpoint: 5,
      comparisons: 'same-run engine retained heap normalized by frozen legacy',
      growthGate: 'all three growth deltas exceed matching empty-control envelope',
      informationalOnly: true,
    },
    rows: reference.rows.map(row => combineRow(row, runs)),
  }
}

/** Combine one stable row across every version and run. */
function combineRow(reference: MemoryBenchmarkRow, reports: MemoryVersionRuns): any {
  const rows = mapVersions(reports, versionReports => versionReports.map(report => findRow(report, reference)))
  const engineMeasurements = mapVersions(rows, versionRows => versionRows.map(row => row.implementations.engine))
  const controls = mapVersions(reports, versionReports => versionReports.map(findControlGrowth))
  const normalized = reference.scenarioId === 'empty-control'
    ? undefined
    : mapVersions(rows, versionRows => versionRows.map(row => ratio(row.implementations.engine, row.implementations.legacy)))
  const v4Ratios = normalized?.dataCoreV4
  const v5Ratios = normalized?.dataCoreV5
  const legacyMeasurements = rows.dataCoreV5.map(row => row.implementations.legacy)
  const v5Measurements = engineMeasurements.dataCoreV5
  const legacyControlGrowth = reports.dataCoreV5.map(findLegacyControlGrowth)
  const v5ControlGrowth = controls.dataCoreV5
  const legacyControlTeardown = reports.dataCoreV5.map(findLegacyControlTeardown)
  const v5ControlTeardown = reports.dataCoreV5.map(findEngineControlTeardown)
  return {
    scenarioId: reference.scenarioId,
    scenarioName: reference.scenarioName,
    dimensions: reference.dimensions,
    unit: reference.unit,
    warmupUnits: reference.warmupUnits,
    growthUnits: reference.growthUnits,
    medians: {
      legacyBytes: summarize(Object.values(rows).flatMap(versionRows => versionRows.map(row => row.implementations.legacy.steadyRetainedBytes))).median,
      dataCoreV1Bytes: summarize(engineMeasurements.dataCoreV1.map(value => value.steadyRetainedBytes)).median,
      dataCoreV2Bytes: summarize(engineMeasurements.dataCoreV2.map(value => value.steadyRetainedBytes)).median,
      dataCoreV3Bytes: summarize(engineMeasurements.dataCoreV3.map(value => value.steadyRetainedBytes)).median,
      dataCoreV4Bytes: summarize(engineMeasurements.dataCoreV4.map(value => value.steadyRetainedBytes)).median,
      dataCoreV5Bytes: summarize(engineMeasurements.dataCoreV5.map(value => value.steadyRetainedBytes)).median,
    },
    normalizedRatios: normalized
      ? mapVersions(normalized, values => summarize(values).median)
      : null,
    normalizedRatioRanges: normalized
      ? mapVersions(normalized, values => summarize(values).range)
      : null,
    v4Comparisons: normalized && v4Ratios
      ? {
          dataCoreV4VsV1: summarize(v4Ratios).median / summarize(normalized.dataCoreV1).median,
          dataCoreV4VsV2: summarize(v4Ratios).median / summarize(normalized.dataCoreV2).median,
          dataCoreV4VsV3: summarize(v4Ratios).median / summarize(normalized.dataCoreV3).median,
          dataCoreV4VsV1Envelope: ratioEnvelope(v4Ratios, normalized.dataCoreV1),
          dataCoreV4VsV2Envelope: ratioEnvelope(v4Ratios, normalized.dataCoreV2),
          dataCoreV4VsV3Envelope: ratioEnvelope(v4Ratios, normalized.dataCoreV3),
        }
      : null,
    v5Comparisons: normalized && v5Ratios
      ? {
          dataCoreV5VsV1: summarize(v5Ratios).median / summarize(normalized.dataCoreV1).median,
          dataCoreV5VsV2: summarize(v5Ratios).median / summarize(normalized.dataCoreV2).median,
          dataCoreV5VsV3: summarize(v5Ratios).median / summarize(normalized.dataCoreV3).median,
          dataCoreV5VsV4: summarize(v5Ratios).median / summarize(normalized.dataCoreV4).median,
          dataCoreV5VsV1Envelope: ratioEnvelope(v5Ratios, normalized.dataCoreV1),
          dataCoreV5VsV2Envelope: ratioEnvelope(v5Ratios, normalized.dataCoreV2),
          dataCoreV5VsV3Envelope: ratioEnvelope(v5Ratios, normalized.dataCoreV3),
          dataCoreV5VsV4Envelope: ratioEnvelope(v5Ratios, normalized.dataCoreV4),
        }
      : null,
    parity: reference.scenarioId === 'empty-control'
      ? null
      : {
          setup: classifyMemoryParity(
            v5Measurements.map(value => value.setupRetainedBytes),
            legacyMeasurements.map(value => value.setupRetainedBytes),
          ),
          steady: classifyMemoryParity(
            v5Measurements.map(value => value.steadyRetainedBytes),
            legacyMeasurements.map(value => value.steadyRetainedBytes),
          ),
          growth: classifyMemoryParity(
            controlAdjustedDelta(v5Measurements.map(value => value.growthBytes), v5ControlGrowth),
            controlAdjustedDelta(legacyMeasurements.map(value => value.growthBytes), legacyControlGrowth),
          ),
          teardown: classifyMemoryParity(
            controlAdjustedDelta(v5Measurements.map(value => value.teardownResidualBytes), v5ControlTeardown),
            controlAdjustedDelta(legacyMeasurements.map(value => value.teardownResidualBytes), legacyControlTeardown),
          ),
        },
    summaries: mapVersions(engineMeasurements, summarizeMemoryMeasurements),
    growthSignals: mapVersions(engineMeasurements, (values, version) => classifyRetainedGrowth(values.map(value => value.growthBytes), controls[version])),
    runs: rows,
  }
}

/** Validate run count, environment, legacy identity, and row matrix. */
function validateVersionRuns(runs: MemoryVersionRuns, expectedLegacyHash: string): void {
  const reports = Object.values(runs).flat()
  if (Object.values(runs).some(versionRuns => versionRuns.length !== 3))
    throw new TypeError('Memory version report requires exactly three runs per version')
  const reference = reports[0]
  if (!reference)
    throw new TypeError('Memory version report contains no runs')
  const fingerprint = environmentKey(reference)
  const rowKeys = reference.rows.map(rowKey)
  for (const report of reports) {
    if (environmentKey(report) !== fingerprint)
      throw new TypeError('Memory benchmark environment drift detected')
    if (report.environment.legacyHash !== expectedLegacyHash)
      throw new TypeError('Memory benchmark legacy fixture hash drift detected')
    if (report.rows.map(rowKey).join('\n') !== rowKeys.join('\n'))
      throw new TypeError('Memory benchmark row matrix drift detected')
    for (const row of report.rows) {
      if (!row.implementations.legacy || !row.implementations.engine)
        throw new TypeError(`Memory benchmark row ${rowKey(row)} is missing implementation data`)
    }
  }
}

/** Return exact row from one report. */
function findRow(report: MemoryBenchmarkReport, reference: MemoryBenchmarkRow): MemoryBenchmarkRow {
  const key = rowKey(reference)
  const row = report.rows.find(candidate => rowKey(candidate) === key)
  if (!row)
    throw new TypeError(`Memory benchmark report missing row ${key}`)
  return row
}

/** Return empty-control engine growth for one run. */
function findControlGrowth(report: MemoryBenchmarkReport): number {
  return report.rows.find(row => row.scenarioId === 'empty-control')?.implementations.engine.growthBytes ?? 0
}

/** Return empty-control legacy growth for one run. */
function findLegacyControlGrowth(report: MemoryBenchmarkReport): number {
  return report.rows.find(row => row.scenarioId === 'empty-control')?.implementations.legacy.growthBytes ?? 0
}

/** Return empty-control engine teardown residual for one run. */
function findEngineControlTeardown(report: MemoryBenchmarkReport): number {
  return report.rows.find(row => row.scenarioId === 'empty-control')?.implementations.engine.teardownResidualBytes ?? 0
}

/** Return empty-control legacy teardown residual for one run. */
function findLegacyControlTeardown(report: MemoryBenchmarkReport): number {
  return report.rows.find(row => row.scenarioId === 'empty-control')?.implementations.legacy.teardownResidualBytes ?? 0
}

/** Normalize engine retained heap by same-run frozen legacy. */
function ratio(engine: MemoryMeasurement, legacy: MemoryMeasurement): number {
  if (engine.steadyRetainedBytes <= 0 || legacy.steadyRetainedBytes <= 0)
    throw new TypeError('Steady retained heap must be positive for version normalization')
  return engine.steadyRetainedBytes / legacy.steadyRetainedBytes
}

/** Map all stable version keys without losing key types. */
function mapVersions<T, R>(values: Record<VersionKey, T>, map: (value: T, version: VersionKey) => R): Record<VersionKey, R> {
  return Object.fromEntries(Object.entries(values).map(([version, value]) => [version, map(value, version as VersionKey)])) as Record<VersionKey, R>
}

/** Return runtime fingerprint excluding selected profile label. */
function environmentKey(report: MemoryBenchmarkReport): string {
  const { node, platform, arch } = report.environment
  return `${node}|${platform}|${arch}`
}

/** Return stable scenario and dimensions key. */
function rowKey(row: MemoryBenchmarkRow): string {
  return `${row.scenarioId}|${row.dimensions.items}|${row.dimensions.watchers}`
}
