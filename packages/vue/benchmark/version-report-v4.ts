import type { BenchmarkReport } from './runner'

/** Immutable identities embedded in five-implementation artifact. */
export interface V4VersionLabels {
  /** Frozen legacy source path. */
  legacy?: string
  /** Data Core v1 commit. */
  dataCoreV1: string
  /** Data Core v2 commit. */
  dataCoreV2: string
  /** Data Core v3 runtime commit. */
  dataCoreV3: string
  /** Data Core v4 candidate label. */
  dataCoreV4: string
  /** SHA-256 of uncommitted candidate diff. */
  candidateDiffHash: string
}

/** Add three paired v4 runs to existing legacy/v1/v2/v3 history. */
export function combineV4VersionReports(
  baseline: any,
  candidates: readonly BenchmarkReport[],
  versions: V4VersionLabels,
  currentV3: readonly BenchmarkReport[] = [],
): any {
  validateRuns(baseline, candidates, 'Data Core v4')
  if (currentV3.length)
    validateRuns(baseline, currentV3, 'Data Core v3')
  const candidateRows = mapRuns(candidates)
  const v3Rows = mapRuns(currentV3)
  const rows = baseline.rows.map((row: any) => combineRow(row, candidateRows, v3Rows))
  return {
    generatedAt: new Date().toISOString(),
    environment: { ...baseline.environment, candidate: candidates[0]!.environment },
    versions: { ...versions, legacy: versions.legacy ?? baseline.versions?.legacy },
    cacheBounds: { indexResultEntries: 128, indexResultWrapperReferences: 20_000, orphanSignals: 256 },
    runQuality: {
      ...baseline.runQuality,
      ...(currentV3.length ? { dataCoreV3Current: currentV3.map(summarizeRun) } : {}),
      dataCoreV4: candidates.map(summarizeRun),
    },
    geometricMeans: {
      dataCoreV4VsV3: geometricMean(rows.map((row: any) => row.speedups.dataCoreV4VsV3)),
      dataCoreV4VsV2: geometricMean(rows.map((row: any) => row.speedups.dataCoreV4VsV2)),
      dataCoreV4VsV1: geometricMean(rows.map((row: any) => row.speedups.dataCoreV4VsV1)),
    },
    residualRegressions: {
      versusLegacy: rows.filter((row: any) => row.speedups.dataCoreV4VsLegacyVerdicts.some((value: string) => value !== 'engine faster')).map(identity),
      versusV3: rows.filter((row: any) => row.speedups.dataCoreV4VsV3ConfidenceEnvelope[1] < 1).map(identity),
      versusV2: rows.filter((row: any) => row.speedups.dataCoreV4VsV2ConfidenceEnvelope[1] < 1).map(identity),
      versusV1: rows.filter((row: any) => row.speedups.dataCoreV4VsV1ConfidenceEnvelope[1] < 1).map(identity),
    },
    rows,
  }
}

/** Combine one stable scenario/dimension row across five implementations. */
function combineRow(row: any, candidates: RunMaps, currentV3: RunMaps): any {
  const key = rowKey(row)
  const v4Runs = readMappedRuns(candidates, key, 'Data Core v4')
  const v3Runs = currentV3.length ? readMappedRuns(currentV3, key, 'Data Core v3') : row.runs.dataCoreV3
  const v1Speedups = row.runs.dataCoreV1.map(readSpeedup)
  const v2Speedups = row.runs.dataCoreV2.map(readSpeedup)
  const v3Speedups = v3Runs.map(readSpeedup)
  const v4Speedups = v4Runs.map((run: any) => run.speedup)
  const v1Intervals = row.runs.dataCoreV1.map(readInterval)
  const v2Intervals = row.runs.dataCoreV2.map(readInterval)
  const v3Intervals = v3Runs.map(readInterval)
  const v4Intervals = v4Runs.map((run: any) => run.speedupInterval)
  return {
    ...row,
    medians: {
      ...row.medians,
      legacyMicroseconds: median(v4Runs.map((run: any) => run.implementations.legacy.meanMicroseconds)),
      dataCoreV3Microseconds: median(v3Runs.map(readMean)),
      dataCoreV4Microseconds: median(v4Runs.map((run: any) => run.implementations.engine.meanMicroseconds)),
    },
    speedups: {
      ...row.speedups,
      dataCoreV4VsLegacy: median(v4Speedups),
      dataCoreV4VsLegacyRange: range(v4Speedups),
      dataCoreV4VsLegacyIntervals: v4Intervals,
      dataCoreV4VsLegacyVerdicts: v4Runs.map((run: any) => run.verdict),
      normalizedLegacyRatios: { dataCoreV1: v1Speedups, dataCoreV2: v2Speedups, dataCoreV3: v3Speedups, dataCoreV4: v4Speedups },
      ...versionRatio('dataCoreV4VsV3', v4Speedups, v3Speedups, v4Intervals, v3Intervals),
      ...versionRatio('dataCoreV4VsV2', v4Speedups, v2Speedups, v4Intervals, v2Intervals),
      ...versionRatio('dataCoreV4VsV1', v4Speedups, v1Speedups, v4Intervals, v1Intervals),
    },
    uncertainty: {
      ...row.uncertainty,
      dataCoreV3MaxRme: Math.max(...v3Runs.flatMap(readRmes)),
      dataCoreV4MaxRme: Math.max(...v4Runs.flatMap(readRmes)),
    },
    runs: { ...row.runs, dataCoreV3: v3Runs, dataCoreV4: v4Runs },
  }
}

type RunMaps = ReadonlyArray<ReadonlyMap<string, BenchmarkReport['rows'][number]>>

/** Map each report by stable scenario and item dimensions. */
function mapRuns(reports: readonly BenchmarkReport[]): RunMaps {
  return reports.map(report => new Map(report.rows.map(row => [rowKey(row), row])))
}

/** Resolve one row from every mapped run or reject incomplete reports. */
function readMappedRuns(runs: RunMaps, key: string, label: string): any[] {
  return runs.map((rows) => {
    const row = rows.get(key)
    if (!row)
      throw new TypeError(`${label} report missing benchmark row ${key}`)
    return row
  })
}

/** Validate run count, row count, and Node fingerprint. */
function validateRuns(baseline: any, reports: readonly BenchmarkReport[], label: string): void {
  if (reports.length !== 3)
    throw new TypeError(`Expected three ${label} reports, received ${reports.length}`)
  const node = baseline.environment?.candidate?.node ?? baseline.environment?.node
  for (const report of reports) {
    if (report.rows.length !== baseline.rows.length)
      throw new TypeError(`${label} row count ${report.rows.length} does not match baseline ${baseline.rows.length}`)
    if (node && report.environment.node !== node)
      throw new TypeError(`Node mismatch: baseline ${node}, candidate ${report.environment.node}`)
  }
}

/** Build point, run envelope, and confidence envelope for one comparison. */
function versionRatio(name: string, candidate: number[], baseline: number[], candidateIntervals: Interval[], baselineIntervals: Interval[]): any {
  return {
    [name]: median(candidate) / median(baseline),
    [`${name}Envelope`]: ratioEnvelope(candidate, baseline),
    [`${name}ConfidenceEnvelope`]: intervalRatioEnvelope(candidateIntervals, baselineIntervals),
  }
}

type Interval = readonly [number, number]

/** Read engine mean from old combined or paired benchmark shape. */
function readMean(run: any): number {
  return run.dataCoreV1?.meanMicroseconds ?? run.dataCoreV2?.meanMicroseconds ?? run.implementations.engine.meanMicroseconds
}

/** Read paired legacy-normalized speedup. */
function readSpeedup(run: any): number {
  if (typeof run.speedup === 'number')
    return run.speedup
  const legacy = run.legacy?.meanMicroseconds ?? run.implementations?.legacy?.meanMicroseconds
  if (typeof legacy !== 'number')
    throw new TypeError('Baseline run is missing legacy mean')
  return legacy / readMean(run)
}

/** Read paired confidence interval, falling back to point ratio. */
function readInterval(run: any): Interval {
  const speedup = readSpeedup(run)
  return run.speedupInterval ?? [speedup, speedup]
}

/** Read all implementation RMEs in one run. */
function readRmes(run: any): number[] {
  if (run.implementations)
    return Object.values(run.implementations).map((value: any) => value.rme)
  return [run.legacy?.rme, run.dataCoreV2?.rme].filter((value): value is number => typeof value === 'number')
}

/** Compute conservative candidate/baseline point envelope. */
function ratioEnvelope(candidate: number[], baseline: number[]): [number, number] {
  return range(candidate.flatMap(value => baseline.map(base => value / base)))
}

/** Compute conservative candidate/baseline confidence envelope. */
function intervalRatioEnvelope(candidate: Interval[], baseline: Interval[]): [number, number] {
  const lower = candidate.flatMap(value => baseline.map(base => value[0] / base[1]))
  const upper = candidate.flatMap(value => baseline.map(base => value[1] / base[0]))
  return [Math.min(...lower), Math.max(...upper)]
}

/** Summarize classifications, uncertainty, and retries for one run. */
function summarizeRun(report: BenchmarkReport): any {
  const classification = { faster: 0, slower: 0, noClearDifference: 0, noisy: 0 }
  for (const row of report.rows) {
    const key = row.verdict === 'engine faster' ? 'faster' : row.verdict === 'legacy faster' ? 'slower' : row.verdict === 'no clear difference' ? 'noClearDifference' : 'noisy'
    classification[key]++
  }
  return {
    classification,
    maxRme: Math.max(...report.rows.flatMap(row => Object.values(row.implementations).map(value => value.rme))),
    reruns: report.rows.reduce((total, row) => total + row.reruns, 0),
  }
}

/** Return stable scenario key. */
function rowKey(row: { scenarioId: string, dimensions: { items: number } }): string {
  return `${row.scenarioId}|${row.dimensions.items}`
}

/** Return compact residual identity. */
function identity(row: any): any {
  return { scenarioId: row.scenarioId, dimensions: row.dimensions }
}

/** Return inclusive bounds. */
function range(values: number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)]
}

/** Return median. */
function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
}

/** Return geometric mean for positive version ratios. */
function geometricMean(values: number[]): number {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
}
