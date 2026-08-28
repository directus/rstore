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

/** Configuration for adding one candidate to an existing version artifact. */
export interface NextVersionConfig {
  /** Candidate report property. */
  candidateKey: string
  /** Human-readable candidate label. */
  candidateLabel: string
  /** Existing Data Core report properties in version order. */
  baselineKeys: string[]
  /** Existing version optionally refreshed beside candidate. */
  currentBaselineKey: string
  /** Cache ownership bounds recorded in report. */
  cacheBounds: Record<string, number>
}

/** Add three paired v4 runs to existing legacy/v1/v2/v3 history. */
export function combineV4VersionReports(
  baseline: any,
  candidates: readonly BenchmarkReport[],
  versions: V4VersionLabels,
  currentV3: readonly BenchmarkReport[] = [],
): any {
  return combineNextVersionReports(baseline, candidates, versions, currentV3, {
    candidateKey: 'dataCoreV4',
    candidateLabel: 'Data Core v4',
    baselineKeys: ['dataCoreV1', 'dataCoreV2', 'dataCoreV3'],
    currentBaselineKey: 'dataCoreV3',
    cacheBounds: { indexResultEntries: 128, indexResultWrapperReferences: 20_000, orphanSignals: 256 },
  })
}

/** Add three paired candidate runs to an existing version artifact. */
export function combineNextVersionReports(
  baseline: any,
  candidates: readonly BenchmarkReport[],
  versions: object & { legacy?: string },
  currentBaseline: readonly BenchmarkReport[],
  config: NextVersionConfig,
): any {
  validateRuns(baseline, candidates, config.candidateLabel)
  if (currentBaseline.length)
    validateRuns(baseline, currentBaseline, displayVersion(config.currentBaselineKey))
  const candidateRows = mapRuns(candidates)
  const baselineRows = mapRuns(currentBaseline)
  const rows = baseline.rows.map((row: any) => combineRow(row, candidateRows, baselineRows, config))
  const comparisonKeys = config.baselineKeys.map(key => `${config.candidateKey}Vs${versionSuffix(key)}`)
  return {
    generatedAt: new Date().toISOString(),
    environment: { ...baseline.environment, candidate: candidates[0]!.environment },
    versions: { ...versions, legacy: versions.legacy ?? baseline.versions?.legacy },
    cacheBounds: config.cacheBounds,
    runQuality: {
      ...baseline.runQuality,
      ...(currentBaseline.length ? { [`${config.currentBaselineKey}Current`]: currentBaseline.map(summarizeRun) } : {}),
      [config.candidateKey]: candidates.map(summarizeRun),
    },
    geometricMeans: Object.fromEntries(comparisonKeys.map(key => [key, geometricMean(rows.map((row: any) => row.speedups[key]))])),
    residualRegressions: {
      versusLegacy: rows.filter((row: any) => row.speedups[`${config.candidateKey}VsLegacyVerdicts`].some((value: string) => value !== 'engine faster')).map(identity),
      ...Object.fromEntries(config.baselineKeys.map(key => [
        `versus${versionSuffix(key)}`,
        rows.filter((row: any) => row.speedups[`${config.candidateKey}Vs${versionSuffix(key)}ConfidenceEnvelope`][1] < 1).map(identity),
      ])),
    },
    rows,
  }
}

/** Combine one stable row across candidate and historical versions. */
function combineRow(row: any, candidates: RunMaps, refreshed: RunMaps, config: NextVersionConfig): any {
  const key = rowKey(row)
  const candidateRuns = readMappedRuns(candidates, key, config.candidateLabel)
  const versionRuns = Object.fromEntries(config.baselineKeys.map(version => [
    version,
    version === config.currentBaselineKey && refreshed.length
      ? readMappedRuns(refreshed, key, displayVersion(version))
      : row.runs[version],
  ])) as Record<string, any[]>
  const candidateSpeedups = candidateRuns.map((run: any) => run.speedup)
  const candidateIntervals = candidateRuns.map((run: any) => run.speedupInterval)
  const baselineSpeedups = Object.fromEntries(config.baselineKeys.map(version => [version, versionRuns[version]!.map(readSpeedup)]))
  const baselineIntervals = Object.fromEntries(config.baselineKeys.map(version => [version, versionRuns[version]!.map(readInterval)]))
  const comparisons = Object.fromEntries(config.baselineKeys.flatMap((version) => {
    const name = `${config.candidateKey}Vs${versionSuffix(version)}`
    return Object.entries(versionRatio(name, candidateSpeedups, baselineSpeedups[version]!, candidateIntervals, baselineIntervals[version]!))
  }))
  return {
    ...row,
    medians: {
      ...row.medians,
      legacyMicroseconds: median(candidateRuns.map((run: any) => run.implementations.legacy.meanMicroseconds)),
      [`${config.currentBaselineKey}Microseconds`]: median(versionRuns[config.currentBaselineKey]!.map(readMean)),
      [`${config.candidateKey}Microseconds`]: median(candidateRuns.map((run: any) => run.implementations.engine.meanMicroseconds)),
    },
    speedups: {
      ...row.speedups,
      [`${config.candidateKey}VsLegacy`]: median(candidateSpeedups),
      [`${config.candidateKey}VsLegacyRange`]: range(candidateSpeedups),
      [`${config.candidateKey}VsLegacyIntervals`]: candidateIntervals,
      [`${config.candidateKey}VsLegacyVerdicts`]: candidateRuns.map((run: any) => run.verdict),
      normalizedLegacyRatios: { ...baselineSpeedups, [config.candidateKey]: candidateSpeedups },
      ...comparisons,
    },
    uncertainty: {
      ...row.uncertainty,
      [`${config.currentBaselineKey}MaxRme`]: Math.max(...versionRuns[config.currentBaselineKey]!.flatMap(readRmes)),
      [`${config.candidateKey}MaxRme`]: Math.max(...candidateRuns.flatMap(readRmes)),
    },
    runs: { ...row.runs, ...versionRuns, [config.candidateKey]: candidateRuns },
  }
}

type RunMaps = ReadonlyArray<ReadonlyMap<string, BenchmarkReport['rows'][number]>>
type Interval = readonly [number, number]

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

/** Summarize classifications, uncertainty, and retries for one run. */
function summarizeRun(report: BenchmarkReport): any {
  const classification = { faster: 0, slower: 0, noClearDifference: 0, noisy: 0 }
  for (const row of report.rows) {
    const key = row.verdict === 'engine faster' ? 'faster' : row.verdict === 'legacy faster' ? 'slower' : row.verdict === 'no clear difference' ? 'noClearDifference' : 'noisy'
    classification[key]++
  }
  return { classification, maxRme: Math.max(...report.rows.flatMap(row => Object.values(row.implementations).map(value => value.rme))), reruns: report.rows.reduce((total, row) => total + row.reruns, 0) }
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

/** Return stable row identity. */
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
/** Return geometric mean for positive ratios. */
function geometricMean(values: number[]): number {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
}
/** Return short version suffix. */
function versionSuffix(key: string): string {
  return key.replace('dataCore', '')
}
/** Return display version label. */
function displayVersion(key: string): string {
  return `Data Core ${versionSuffix(key).toLowerCase()}`
}
