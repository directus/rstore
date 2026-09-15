import { describe, expect, it } from 'vitest'
import { applyBenchmarkReruns } from '../benchmark/report-reruns'
import { combineVersionReports, parseBenchmarkOutput } from '../benchmark/version-report'
import { combineV4VersionReports } from '../benchmark/version-report-v4'
import { renderV4VersionReportMarkdown } from '../benchmark/version-report-v4-markdown'
import { combineV5VersionReports } from '../benchmark/version-report-v5'
import { renderV5VersionReportMarkdown } from '../benchmark/version-report-v5-markdown'
import { combineV6VersionReports } from '../benchmark/version-report-v6'

describe('four-version benchmark report', () => {
  it('combines three candidate runs with stable labels and envelopes', () => {
    const report = combineVersionReports(baseline() as any, [candidate(2), candidate(2.5), candidate(3)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      candidateDiffHash: 'diff',
    })

    expect(report.versions).toMatchObject({ dataCoreV1: 'v1', dataCoreV2: 'v2', dataCoreV3: 'v3', candidateDiffHash: 'diff' })
    expect(report.runQuality.dataCoreV3).toHaveLength(3)
    expect(report.rows[0]).toMatchObject({
      scenarioId: 'write',
      medians: { legacyMicroseconds: 10, dataCoreV1Microseconds: 5, dataCoreV2Microseconds: 4, dataCoreV3Microseconds: 2.5 },
    })
    expect(report.rows[0]!.speedups.dataCoreV3VsV2Envelope[0]).toBeCloseTo(4 / 3)
    expect(report.rows[0]!.speedups.dataCoreV3VsV2Envelope[1]).toBe(2)
    expect(report.rows[0]!.speedups.dataCoreV3VsV1Envelope[0]).toBeCloseTo(5 / 3)
    expect(report.rows[0]!.speedups.dataCoreV3VsV1Envelope[1]).toBe(2.5)
    expect(report.rows[0]!.runs.dataCoreV3).toHaveLength(3)
  })

  it('parses JSON-only and console-plus-JSON benchmark output', () => {
    const value = { environment: { node: 'v1' }, rows: [] }
    expect(parseBenchmarkOutput(JSON.stringify(value))).toEqual(value)
    expect(parseBenchmarkOutput(`console table\n${JSON.stringify(value, null, 2)}\n`)).toEqual(value)
  })

  it('adds three v4 runs without discarding prior run evidence', () => {
    const previous = combineVersionReports(baseline() as any, [candidate(3), candidate(3), candidate(3)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      candidateDiffHash: 'v3-diff',
    })
    const report = combineV4VersionReports(previous, [candidate(1.5), candidate(2), candidate(2.5)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      dataCoreV4: 'v4',
      candidateDiffHash: 'v4-diff',
    })

    expect(report.versions).toMatchObject({ dataCoreV1: 'v1', dataCoreV2: 'v2', dataCoreV3: 'v3', dataCoreV4: 'v4' })
    expect(report.runQuality.dataCoreV4).toHaveLength(3)
    expect(report.rows[0]).toMatchObject({
      medians: { dataCoreV3Microseconds: 3, dataCoreV4Microseconds: 2 },
      runs: { dataCoreV1: expect.any(Array), dataCoreV2: expect.any(Array), dataCoreV3: expect.any(Array), dataCoreV4: expect.any(Array) },
    })
    expect(report.rows[0]!.runs.dataCoreV4).toHaveLength(3)
    expect(report.rows[0]!.speedups.dataCoreV4VsV3).toBeCloseTo(1.5)
    expect(report.geometricMeans.dataCoreV4VsV3).toBeCloseTo(1.5)
    expect(report.cacheBounds).toEqual({ indexResultEntries: 128, indexResultWrapperReferences: 20_000, orphanSignals: 256 })
  })

  it('uses fresh v3 runs for current-machine v4 envelopes', () => {
    const previous = combineVersionReports(baseline() as any, [candidate(3), candidate(3), candidate(3)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      candidateDiffHash: 'v3-diff',
    })
    const freshV3 = [candidate(4), candidate(4), candidate(4)] as any
    const report = combineV4VersionReports(previous, [candidate(2), candidate(2), candidate(2)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      dataCoreV4: 'v4',
      candidateDiffHash: 'v4-diff',
    }, freshV3)

    expect(report.runQuality.dataCoreV3Current).toHaveLength(3)
    expect(report.rows[0]!.medians.dataCoreV3Microseconds).toBe(4)
    expect(report.rows[0]!.speedups.dataCoreV4VsV3).toBe(2)
  })

  it('adds v5 runs and classifies same-machine v4 slowdown tolerance', () => {
    const v3 = combineVersionReports(baseline() as any, [candidate(3), candidate(3), candidate(3)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      candidateDiffHash: 'v3-diff',
    })
    const v4 = combineV4VersionReports(v3, [candidate(2), candidate(2), candidate(2)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      dataCoreV4: 'v4',
      candidateDiffHash: 'v4-diff',
    })
    const report = combineV5VersionReports(v4, [candidate(2.1), candidate(2.1), candidate(2.1)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      dataCoreV4: 'v4',
      dataCoreV5: 'v5',
      candidateDiffHash: 'v5-diff',
    }, [candidate(2), candidate(2), candidate(2)] as any)

    expect(report.rows[0]).toMatchObject({
      medians: { dataCoreV4Microseconds: 2, dataCoreV5Microseconds: 2.1 },
      performanceTarget: 'meets target',
    })
    expect(report.rows[0]!.speedups.dataCoreV5VsV4).toBeCloseTo(2 / 2.1)
    expect(report.cacheBounds.orphanSignals).toBe(0)
    expect(renderV5VersionReportMarkdown(report)).toContain('median <=10%')
  })

  it('compares three same-machine v5/v6 CPU runs with tighter guards', () => {
    const report = combineV6VersionReports(
      [candidate(2), candidate(2), candidate(2)] as any,
      [candidate(2.1), candidate(2.1), candidate(2.1)] as any,
      { dataCoreV5: 'v5', dataCoreV6: 'v6', candidateDiffHash: 'diff', legacyHash: 'legacy' },
    )

    expect(report.rows[0]).toMatchObject({ performanceRatio: 1.05, acceptance: 'meets target' })
    expect(report.acceptance).toMatchObject({ rowsMeetingTarget: 1, allRowsMeetTarget: true })
  })

  it('renders version uncertainty in plain language', () => {
    const previous = combineVersionReports(baseline() as any, [candidate(4), candidate(4), candidate(4)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      candidateDiffHash: 'v3-diff',
    })
    const report = combineV4VersionReports(previous, [candidate(2), candidate(2), candidate(2)] as any, {
      dataCoreV1: 'v1',
      dataCoreV2: 'v2',
      dataCoreV3: 'v3',
      dataCoreV4: 'v4',
      candidateDiffHash: 'v4-diff',
    })

    const markdown = renderV4VersionReportMarkdown(report)
    expect(markdown).toContain('Typical v4 throughput gain versus v3: 100% faster.')
    expect(markdown).toContain('plausible 63.6–144.4% faster')
    expect(markdown).toContain('Each Data Core version is first compared with legacy measured beside it')
    expect(markdown).toContain('result says `unclear`')
    expect(markdown).not.toContain('envelope')
  })

  it('replaces one noisy row with an explicit compatible retry', () => {
    const original = candidate(3)
    original.rows[0]!.reruns = 3
    const report = applyBenchmarkReruns(original as any, [candidate(2)] as any)

    expect(report.rows[0]).toMatchObject({
      reruns: 4,
      verdict: 'engine faster',
      implementations: { engine: { meanMicroseconds: 2 } },
    })
  })
})

/** Create one old combined-report fixture. */
function baseline() {
  const dataCoreV1 = [5, 5, 5].map(meanMicroseconds => ({
    legacy: { meanMicroseconds: 10 },
    dataCoreV1: { meanMicroseconds },
  }))
  const dataCoreV2 = [4, 4, 4].map(meanMicroseconds => ({
    implementations: { legacy: { meanMicroseconds: 10 }, engine: { meanMicroseconds } },
  }))
  return {
    environment: { node: 'v23.9.0' },
    versions: {},
    runQuality: {},
    rows: [{
      scenarioId: 'write',
      scenarioName: 'write',
      dimensions: { items: 1000, watchers: 0 },
      medians: { legacyMicroseconds: 10, dataCoreV1Microseconds: 5, dataCoreV2Microseconds: 4 },
      speedups: {},
      uncertainty: {},
      runs: { dataCoreV1, dataCoreV2 },
    }],
  }
}

/** Create one paired legacy/candidate report fixture. */
function candidate(meanMicroseconds: number) {
  return {
    environment: { node: 'v23.9.0', platform: 'linux', arch: 'x64', profile: 'full', timeMs: 1000, maxRme: 3 },
    rows: [{
      scenarioId: 'write',
      scenarioName: 'write',
      dimensions: { items: 1000, watchers: 0 },
      implementations: {
        legacy: { meanMicroseconds: 10, rme: 1, samples: 10, operationsPerSecond: 100_000, batchSize: 1, counts: {} },
        engine: { meanMicroseconds, rme: 1, samples: 10, operationsPerSecond: 1_000_000 / meanMicroseconds, batchSize: 1, counts: {} },
      },
      reruns: 0,
      speedupInterval: [10 / meanMicroseconds * 0.9, 10 / meanMicroseconds * 1.1],
      speedup: 10 / meanMicroseconds,
      verdict: 'engine faster',
    }],
  }
}
