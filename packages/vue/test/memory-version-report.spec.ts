import type { MemoryBenchmarkReport, MemoryMeasurement } from '../benchmark/memory/types'
import { describe, expect, it } from 'vitest'
import { combineMemoryVersionReports } from '../benchmark/memory/version-report'
import { renderMemoryVersionReportMarkdown } from '../benchmark/memory/version-report-markdown'
import { combineMemoryV6Reports } from '../benchmark/memory/version-report-v6'

const VERSIONS = {
  legacyHash: 'legacy-hash',
  dataCoreV1: 'v1',
  dataCoreV2: 'v2',
  dataCoreV3: 'v3',
  dataCoreV4: 'v4',
  dataCoreV5: 'v5',
  candidateDiffHash: 'diff',
}

describe('memory version report', () => {
  it('combines three same-machine runs per version', () => {
    const report = combineMemoryVersionReports({
      dataCoreV1: runs(800),
      dataCoreV2: runs(700),
      dataCoreV3: runs(600),
      dataCoreV4: runs(500),
      dataCoreV5: runs(450),
    }, VERSIONS)

    expect(report.rows[0]).toMatchObject({
      scenarioId: 'records-only',
      medians: { legacyBytes: 1000, dataCoreV1Bytes: 800, dataCoreV4Bytes: 500, dataCoreV5Bytes: 450 },
      normalizedRatios: { dataCoreV1: 0.8, dataCoreV4: 0.5, dataCoreV5: 0.45 },
      v5Comparisons: { dataCoreV5VsV1: 0.5625, dataCoreV5VsV4: 0.9 },
      parity: { setup: 'meets target', steady: 'meets target' },
    })
    expect(report.rows[0]!.runs.dataCoreV5).toHaveLength(3)
  })

  it('rejects run count, row, environment, and legacy hash drift', () => {
    expect(() => combineMemoryVersionReports({
      dataCoreV1: runs(800).slice(0, 2),
      dataCoreV2: runs(700),
      dataCoreV3: runs(600),
      dataCoreV4: runs(500),
      dataCoreV5: runs(450),
    }, VERSIONS)).toThrow('three')

    const changedRow = runs(700)
    changedRow[1]!.rows[0]!.scenarioId = 'changed'
    expect(() => combineMemoryVersionReports({
      dataCoreV1: runs(800),
      dataCoreV2: changedRow,
      dataCoreV3: runs(600),
      dataCoreV4: runs(500),
      dataCoreV5: runs(450),
    }, VERSIONS)).toThrow('row')

    const changedNode = runs(600)
    changedNode[2]!.environment.node = 'v24.0.0'
    expect(() => combineMemoryVersionReports({
      dataCoreV1: runs(800),
      dataCoreV2: runs(700),
      dataCoreV3: changedNode,
      dataCoreV4: runs(500),
      dataCoreV5: runs(450),
    }, VERSIONS)).toThrow('environment')

    const changedLegacy = runs(500)
    changedLegacy[0]!.environment.legacyHash = 'changed'
    expect(() => combineMemoryVersionReports({
      dataCoreV1: runs(800),
      dataCoreV2: runs(700),
      dataCoreV3: runs(600),
      dataCoreV4: changedLegacy,
      dataCoreV5: runs(450),
    }, VERSIONS)).toThrow('legacy')

    const missingImplementation = runs(450)
    delete (missingImplementation[0]!.rows[0]!.implementations as any).engine
    expect(() => combineMemoryVersionReports({
      dataCoreV1: runs(800),
      dataCoreV2: runs(700),
      dataCoreV3: runs(600),
      dataCoreV4: runs(500),
      dataCoreV5: missingImplementation,
    }, VERSIONS)).toThrow('missing implementation')
  })

  it('renders retained state, growth, and teardown as distinct evidence', () => {
    const report = combineMemoryVersionReports({
      dataCoreV1: runs(800),
      dataCoreV2: runs(700),
      dataCoreV3: runs(600),
      dataCoreV4: runs(500),
      dataCoreV5: runs(450),
    }, VERSIONS)
    const markdown = renderMemoryVersionReportMarkdown(report)

    expect(markdown).toContain('Steady retained heap')
    expect(markdown).toContain('Retained-growth signals')
    expect(markdown).toContain('Post-disposal residuals')
    expect(markdown).toContain('retained-memory evidence snapshot')
  })

  it('compares v6 setup and steady ownership with v5 guards', () => {
    const report = combineMemoryV6Reports(runs(500), runs(490), {
      legacyHash: 'legacy-hash',
      dataCoreV5: 'v5',
      dataCoreV6: 'v6',
      candidateDiffHash: 'diff',
    })

    expect(report.rows[0]).toMatchObject({
      comparisons: { setup: { medianRatio: 0.98 }, steady: { medianRatio: 0.98 } },
      guards: { setup: true, steady: true },
    })
  })
})

/** Create three complete paired memory reports. */
function runs(engineBytes: number): MemoryBenchmarkReport[] {
  return Array.from({ length: 3 }, () => ({
    environment: {
      node: 'v23.9.0',
      platform: 'linux',
      arch: 'x64',
      profile: 'full',
      legacyHash: 'legacy-hash',
    },
    rows: [{
      scenarioId: 'records-only',
      scenarioName: 'records only',
      dimensions: { items: 1000, watchers: 0 },
      unit: 'writes',
      warmupUnits: 10,
      growthUnits: 100,
      implementations: {
        legacy: measurement(1000),
        engine: measurement(engineBytes),
      },
    }],
  }))
}

/** Create one measurement with selected steady retained heap. */
function measurement(steadyRetainedBytes: number): MemoryMeasurement {
  return {
    checkpoints: {
      baselineBytes: 100,
      setupBytes: 100 + steadyRetainedBytes,
      steadyBytes: 100 + steadyRetainedBytes,
      growthBytes: 110 + steadyRetainedBytes,
      teardownBytes: 105,
    },
    setupRetainedBytes: steadyRetainedBytes,
    steadyRetainedBytes,
    growthBytes: 10,
    growthBytesPerUnit: 0.1,
    teardownResidualBytes: 5,
  }
}
