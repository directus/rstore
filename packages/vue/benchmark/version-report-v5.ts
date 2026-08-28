import type { BenchmarkReport } from './runner'
import { combineNextVersionReports } from './version-report-v4'

/** Immutable identities embedded in six-implementation artifact. */
export interface V5VersionLabels {
  /** Frozen legacy source path. */
  legacy?: string
  /** Data Core v1 commit. */
  dataCoreV1: string
  /** Data Core v2 commit. */
  dataCoreV2: string
  /** Data Core v3 commit. */
  dataCoreV3: string
  /** Frozen Data Core v4 commit. */
  dataCoreV4: string
  /** Data Core v5 candidate label. */
  dataCoreV5: string
  /** SHA-256 of uncommitted candidate diff. */
  candidateDiffHash: string
}

/** Add three paired v5 runs to existing legacy/v1/v2/v3/v4 history. */
export function combineV5VersionReports(
  baseline: any,
  candidates: readonly BenchmarkReport[],
  versions: V5VersionLabels,
  currentV4: readonly BenchmarkReport[] = [],
): any {
  const report = combineNextVersionReports(baseline, candidates, versions, currentV4, {
    candidateKey: 'dataCoreV5',
    candidateLabel: 'Data Core v5',
    baselineKeys: ['dataCoreV1', 'dataCoreV2', 'dataCoreV3', 'dataCoreV4'],
    currentBaselineKey: 'dataCoreV4',
    cacheBounds: {
      indexResultEntries: 128,
      indexResultWrapperReferences: 20_000,
      indexResultStrongWrapperReferences: 1_024,
      orphanSignals: 0,
    },
  })
  for (const row of report.rows)
    attachPerformanceTarget(row)
  report.performanceTarget = {
    medianSlowdownLimit: 0.10,
    allRunSlowdownLimit: 0.15,
    rowsMeetingTarget: report.rows.filter((row: any) => row.performanceTarget === 'meets target').length,
    rowCount: report.rows.length,
  }
  return report
}

/** Attach direct v5/v4 duration ratio and conservative all-run classification. */
function attachPerformanceTarget(row: any): void {
  const candidate = row.runs.dataCoreV5.map((run: any) => run.implementations.engine.meanMicroseconds)
  const baseline = row.runs.dataCoreV4.map(readMean)
  const ratios = candidate.flatMap((value: number) => baseline.map((base: number) => value / base))
  const ratio = median(candidate) / median(baseline)
  const envelope: [number, number] = [Math.min(...ratios), Math.max(...ratios)]
  row.performanceRatio = ratio
  row.performanceEnvelope = envelope
  row.performanceTarget = ratio <= 1.10 && envelope[1] <= 1.15 ? 'meets target' : 'misses target'
}

/** Read engine mean from historical or paired report shape. */
function readMean(run: any): number {
  return run.dataCoreV1?.meanMicroseconds ?? run.dataCoreV2?.meanMicroseconds ?? run.implementations.engine.meanMicroseconds
}

/** Return stable median. */
function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
}
