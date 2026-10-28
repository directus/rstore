import type { BenchmarkReport } from './runner'

/** Immutable version labels embedded in final benchmark artifacts. */
export interface BenchmarkVersionLabels {
  /** Legacy source identity. */
  legacy?: string
  /** Data Core v1 commit. */
  dataCoreV1: string
  /** Data Core v2 commit. */
  dataCoreV2: string
  /** Data Core v3 base or candidate label. */
  dataCoreV3: string
  /** SHA-256 of uncommitted candidate diff. */
  candidateDiffHash: string
}

/** Combine existing v1/v2 history with three paired legacy/v3 reports. */
export function combineVersionReports(
  baseline: any,
  candidates: readonly BenchmarkReport[],
  versions: BenchmarkVersionLabels,
  currentV2: readonly BenchmarkReport[] = [],
): any {
  validateCandidateRuns(baseline, candidates, 'Data Core v3')
  if (currentV2.length)
    validateCandidateRuns(baseline, currentV2, 'Data Core v2')
  const candidateRows = candidates.map(report => new Map(report.rows.map(row => [rowKey(row), row])))
  const v2Rows = currentV2.map(report => new Map(report.rows.map(row => [rowKey(row), row])))
  const rows = baseline.rows.map((row: any) => combineRow(row, candidateRows, v2Rows))
  const v1PointEstimatesBelowParity = rows
    .filter((row: any) => row.speedups.dataCoreV3VsV1 < 1)
    .map(v1PointEstimate)
  return {
    generatedAt: new Date().toISOString(),
    environment: {
      ...baseline.environment,
      candidate: candidates[0]!.environment,
    },
    versions: {
      legacy: versions.legacy ?? baseline.versions?.legacy,
      dataCoreV1: versions.dataCoreV1,
      dataCoreV2: versions.dataCoreV2,
      dataCoreV3: versions.dataCoreV3,
      candidateDiffHash: versions.candidateDiffHash,
    },
    runQuality: {
      ...baseline.runQuality,
      ...(currentV2.length ? { dataCoreV2Current: currentV2.map(summarizeRun) } : {}),
      dataCoreV3: candidates.map(summarizeRun),
    },
    residualRegressions: {
      versusLegacy: rows.filter((row: any) => row.speedups.dataCoreV3VsLegacyVerdicts.some((verdict: string) => verdict !== 'engine faster')).map(rowIdentity),
      versusV2: rows.filter((row: any) => row.speedups.dataCoreV3VsV2ConfidenceEnvelope[1] < 1).map(rowIdentity),
      versusV1: rows.filter((row: any) => row.speedups.dataCoreV3VsV1ConfidenceEnvelope[1] < 1).map(rowIdentity),
      v1PointEstimatesBelowParity,
    },
    rows,
  }
}

/** Parse JSON-only output or console output ending in structured JSON. */
export function parseBenchmarkOutput(source: string): BenchmarkReport {
  const trimmed = source.trim()
  try {
    return JSON.parse(trimmed)
  }
  catch {}
  let index = trimmed.lastIndexOf('{')
  while (index >= 0) {
    try {
      const value = JSON.parse(trimmed.slice(index))
      if (value?.environment && Array.isArray(value.rows))
        return value
    }
    catch {}
    index = trimmed.lastIndexOf('{', index - 1)
  }
  throw new TypeError('Benchmark output does not end with a structured report')
}

/** Combine one stable scenario/dimension row across all versions. */
function combineRow(
  row: any,
  candidates: ReadonlyArray<ReadonlyMap<string, BenchmarkReport['rows'][number]>>,
  currentV2: ReadonlyArray<ReadonlyMap<string, BenchmarkReport['rows'][number]>>,
): any {
  const key = rowKey(row)
  const v3Runs = candidates.map((rows) => {
    const candidate = rows.get(key)
    if (!candidate)
      throw new TypeError(`Candidate report missing benchmark row ${key}`)
    return candidate
  })
  const v2Runs = currentV2.length
    ? currentV2.map((rows) => {
        const candidate = rows.get(key)
        if (!candidate)
          throw new TypeError(`Data Core v2 report missing benchmark row ${key}`)
        return candidate
      })
    : row.runs.dataCoreV2
  const v2Means = v2Runs.map(readRunMean)
  const v3Means = v3Runs.map(run => run.implementations.engine!.meanMicroseconds)
  const legacyMeans = v3Runs.map(run => run.implementations.legacy!.meanMicroseconds)
  const v1Speedups = row.runs.dataCoreV1.map(readRunSpeedup)
  const v2Speedups = v2Runs.map(readRunSpeedup)
  const v3VsLegacy = v3Runs.map(run => run.speedup)
  const v1Intervals = row.runs.dataCoreV1.map(readRunInterval)
  const v2Intervals = v2Runs.map(readRunInterval)
  const v3Intervals = v3Runs.map(run => run.speedupInterval)
  return {
    ...row,
    medians: {
      ...row.medians,
      legacyMicroseconds: median(legacyMeans),
      dataCoreV2Microseconds: median(v2Means),
      dataCoreV3Microseconds: median(v3Means),
    },
    speedups: {
      ...row.speedups,
      dataCoreV3VsLegacy: median(v3VsLegacy),
      dataCoreV3VsLegacyRange: range(v3VsLegacy),
      dataCoreV3VsLegacyIntervals: v3Runs.map(run => run.speedupInterval),
      dataCoreV3VsLegacyVerdicts: v3Runs.map(run => run.verdict),
      normalizedLegacyRatios: {
        dataCoreV1: v1Speedups,
        dataCoreV2: v2Speedups,
        dataCoreV3: v3VsLegacy,
      },
      dataCoreV3VsV2: median(v3VsLegacy) / median(v2Speedups),
      dataCoreV3VsV2Envelope: ratioEnvelope(v3VsLegacy, v2Speedups),
      dataCoreV3VsV2ConfidenceEnvelope: intervalRatioEnvelope(v3Intervals, v2Intervals),
      dataCoreV3VsV1: median(v3VsLegacy) / median(v1Speedups),
      dataCoreV3VsV1Envelope: ratioEnvelope(v3VsLegacy, v1Speedups),
      dataCoreV3VsV1ConfidenceEnvelope: intervalRatioEnvelope(v3Intervals, v1Intervals),
    },
    uncertainty: {
      ...row.uncertainty,
      dataCoreV2MaxRme: Math.max(...v2Runs.flatMap((run: any) => readRunRmes(run))),
      dataCoreV3MaxRme: Math.max(...v3Runs.flatMap(run => Object.values(run.implementations).map(measurement => measurement.rme))),
    },
    runs: {
      ...row.runs,
      dataCoreV2: v2Runs,
      dataCoreV3: v3Runs,
    },
  }
}

/** Verify count, environment, and 59-row comparability before combining. */
function validateCandidateRuns(baseline: any, candidates: readonly BenchmarkReport[], label: string): void {
  if (candidates.length !== 3)
    throw new TypeError(`Expected three ${label} reports, received ${candidates.length}`)
  for (const candidate of candidates) {
    if (candidate.rows.length !== baseline.rows.length)
      throw new TypeError(`Candidate row count ${candidate.rows.length} does not match baseline ${baseline.rows.length}`)
    if (baseline.environment?.node && candidate.environment.node !== baseline.environment.node) {
      throw new TypeError(`Node mismatch: baseline ${baseline.environment.node}, candidate ${candidate.environment.node}`)
    }
  }
}

/** Summarize uncertainty and legacy verdict counts for one final run. */
function summarizeRun(report: BenchmarkReport): any {
  const classification = { faster: 0, slower: 0, noClearDifference: 0, noisy: 0 }
  for (const row of report.rows) {
    if (row.verdict === 'engine faster')
      classification.faster++
    else if (row.verdict === 'legacy faster')
      classification.slower++
    else if (row.verdict === 'no clear difference')
      classification.noClearDifference++
    else
      classification.noisy++
  }
  return {
    classification,
    maxRme: Math.max(...report.rows.flatMap(row => Object.values(row.implementations).map(measurement => measurement.rme))),
    reruns: report.rows.reduce((total, row) => total + row.reruns, 0),
  }
}

/** Read engine mean from legacy combined-run shapes. */
function readRunMean(run: any): number {
  const mean = run.dataCoreV1?.meanMicroseconds
    ?? run.dataCoreV2?.meanMicroseconds
    ?? run.implementations?.engine?.meanMicroseconds
  if (typeof mean !== 'number')
    throw new TypeError('Baseline run is missing Data Core mean')
  return mean
}

/** Read paired legacy speedup from old or current run shapes. */
function readRunSpeedup(run: any): number {
  if (typeof run.speedup === 'number')
    return run.speedup
  const legacy = run.legacy?.meanMicroseconds ?? run.implementations?.legacy?.meanMicroseconds
  return legacy / readRunMean(run)
}

/** Read paired legacy confidence interval, falling back to its point ratio. */
function readRunInterval(run: any): readonly [number, number] {
  return run.speedupInterval ?? [readRunSpeedup(run), readRunSpeedup(run)]
}

/** Read implementation RMEs from old or current run shapes. */
function readRunRmes(run: any): number[] {
  if (run.implementations)
    return Object.values(run.implementations).map((measurement: any) => measurement.rme)
  return [run.legacy?.rme, run.dataCoreV2?.rme].filter((value): value is number => typeof value === 'number')
}

/** Compute all-run conservative baseline/candidate ratio bounds. */
function ratioEnvelope(baseline: readonly number[], candidate: readonly number[]): [number, number] {
  const ratios = baseline.flatMap(base => candidate.map(value => base / value))
  return range(ratios)
}

/** Compare every numerator/denominator confidence-bound pairing. */
function intervalRatioEnvelope(
  numerator: ReadonlyArray<readonly [number, number]>,
  denominator: ReadonlyArray<readonly [number, number]>,
): [number, number] {
  const lower = numerator.flatMap(first => denominator.map(second => first[0] / second[1]))
  const upper = numerator.flatMap(first => denominator.map(second => first[1] / second[0]))
  return [Math.min(...lower), Math.max(...upper)]
}

/** Return inclusive numeric bounds. */
function range(values: readonly number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)]
}

/** Return stable median for an odd or even sample list. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Encode stable row identity across reports. */
function rowKey(row: { scenarioId: string, dimensions: { items: number } }): string {
  return `${row.scenarioId}|${row.dimensions.items}`
}

/** Keep residual lists compact and machine-readable. */
function rowIdentity(row: any): any {
  return { scenarioId: row.scenarioId, dimensions: row.dimensions }
}

/** Describe a non-conclusive v1 point advantage with absolute cost evidence. */
function v1PointEstimate(row: any): any {
  const hydration = row.scenarioId === 'hydrate-state'
  return {
    scenarioId: row.scenarioId,
    dimensions: row.dimensions,
    dataCoreV1Microseconds: row.medians.dataCoreV1Microseconds,
    dataCoreV3Microseconds: row.medians.dataCoreV3Microseconds,
    normalizedRatio: row.speedups.dataCoreV3VsV1,
    confidenceEnvelope: row.speedups.dataCoreV3VsV1ConfidenceEnvelope,
    statisticallyClear: row.speedups.dataCoreV3VsV1ConfidenceEnvelope[1] < 1,
    strongerSemanticCost: hydration
      ? 'Transactional snapshot detachment, collection-key preflight, index membership cache rebuild, module staging, and selective reset invalidation.'
      : 'Optimistic-layer-aware index and wrapper freshness; absolute v3 median is already lower and normalized difference is not conclusive.',
  }
}
