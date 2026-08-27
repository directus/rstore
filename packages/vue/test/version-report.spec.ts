import { describe, expect, it } from 'vitest'
import { combineVersionReports, parseBenchmarkOutput } from '../benchmark/version-report'

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
