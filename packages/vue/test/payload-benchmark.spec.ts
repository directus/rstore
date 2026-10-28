import type { PayloadCheckpoints } from '../benchmark/payload/types'
import { describe, expect, it } from 'vitest'
import { calculatePayloadMeasurement, geometricMean, subtractPayloadControl, summarizeMetric } from '../benchmark/payload/report'
import { combinePayloadVersionReports } from '../benchmark/payload/version-report'
import { assertOwnedPayloadPath, cleanupPayloadController, payloadPreparationCommands } from '../benchmark/payload/version-runner'

const versions = { legacyHash: 'legacy', dataCoreV5: 'v5', dataCoreV6: 'v6', candidateDiffHash: 'diff' }

describe('payload benchmark measurements', () => {
  it('preserves signed heap and RSS deltas', () => {
    const checkpoints: PayloadCheckpoints = {
      moduleHeapBytes: 1_000,
      inputHeapBytes: 1_600,
      retainedHeapBytes: 900,
      teardownHeapBytes: 800,
      rssBeforeBytes: 4_000,
      rssAfterBytes: 3_500,
    }

    expect(calculatePayloadMeasurement(checkpoints, 12.5)).toEqual({
      checkpoints,
      durationMs: 12.5,
      inputRetainedBytes: 600,
      cacheRetainedBytes: -100,
      peakRssDeltaBytes: -500,
      teardownResidualBytes: -200,
    })
  })

  it('calculates medians, ranges, and positive geometric means', () => {
    expect(summarizeMetric([5, -1, 3, 9, 2])).toEqual({ median: 3, range: [-1, 9] })
    expect(geometricMean([0.5, 1, 2])).toBeCloseTo(1)
    expect(() => geometricMean([1, 0])).toThrow('positive finite')
  })

  it('subtracts matching controls while preserving signed noise', () => {
    const value = measurement(12, 900, 50)
    value.teardownResidualBytes = -20
    const control = measurement(2, 100, 75)
    control.teardownResidualBytes = 5

    expect(subtractPayloadControl(value, control)).toEqual({
      durationMs: 10,
      cacheRetainedBytes: 800,
      peakRssDeltaBytes: -25,
      teardownResidualBytes: -25,
    })
  })

  it('combines five v5/v6 runs and preserves zero-crossing RSS as deltas', () => {
    const report = combinePayloadVersionReports({ dataCoreV5: runs(10, 1_000, 0), dataCoreV6: runs(8, 800, -10) }, versions)
    const row = report.rows.find((value: any) => value.scenarioId === 'wide')

    expect(row.comparisons).toMatchObject({
      duration: { medianRatio: 0.8 },
      retainedHeap: { medianRatio: 0.8 },
      peakRssDelta: { medianRatio: null, medianDelta: -10 },
    })
    expect(row.controlAdjusted.dataCoreV6).toMatchObject({
      durationMs: { median: 7 },
      cacheRetainedBytes: { median: 790 },
    })
    expect(report.aggregate).toMatchObject({ durationGeometricMeanRatio: 0.8, peakRssGeometricMeanRatio: null })
  })

  it('rejects run-count, environment, row, hash, and implementation drift', () => {
    expect(() => combinePayloadVersionReports({ dataCoreV5: runs(10, 1_000, 1).slice(1), dataCoreV6: runs(8, 800, 1) }, versions)).toThrow('five')
    const environment = runs(10, 1_000, 1)
    environment[0]!.environment.node = 'changed'
    expect(() => combinePayloadVersionReports({ dataCoreV5: environment, dataCoreV6: runs(8, 800, 1) }, versions)).toThrow('environment')
    const row = runs(10, 1_000, 1)
    row[0]!.rows[0]!.dimensions.items = 2
    expect(() => combinePayloadVersionReports({ dataCoreV5: row, dataCoreV6: runs(8, 800, 1) }, versions)).toThrow('row')
    const hash = runs(10, 1_000, 1)
    hash[0]!.environment.legacyHash = 'changed'
    expect(() => combinePayloadVersionReports({ dataCoreV5: hash, dataCoreV6: runs(8, 800, 1) }, versions)).toThrow('legacy')
    const implementation = runs(10, 1_000, 1)
    delete (implementation[0]!.rows[0]!.implementations as any).engine
    expect(() => combinePayloadVersionReports({ dataCoreV5: implementation, dataCoreV6: runs(8, 800, 1) }, versions)).toThrow('implementation')
  })

  it('constructs locked historical commands and validates owned cleanup', async () => {
    expect(payloadPreparationCommands().map(value => [value.command, ...value.args])).toEqual([
      ['pnpm', 'install', '--frozen-lockfile'],
      ['pnpm', '--filter', '@rstore/shared', 'build'],
      ['pnpm', '--filter', '@rstore/core', 'build'],
    ])
    expect(() => assertOwnedPayloadPath('/home/user/worktree-dataCoreV5')).toThrow('non-owned')
    const removed: string[] = []
    await cleanupPayloadController('/repo', '/tmp/rstore-payload-owned', new Set(['/tmp/rstore-payload-owned/worktree-dataCoreV5']), false, {
      removeWorktree: async (_root, worktree) => { removed.push(worktree) },
      removeTemporaryRoot: async (root) => { removed.push(root) },
    })
    expect(removed).toEqual(['/tmp/rstore-payload-owned/worktree-dataCoreV5'])
  })
})

/** Create five complete synthetic payload reports. */
function runs(durationMs: number, cacheRetainedBytes: number, peakRssDeltaBytes: number): any[] {
  return Array.from({ length: 5 }, () => ({
    environment: { node: 'v23.9.0', platform: 'linux', arch: 'x64', profile: 'full', legacyHash: 'legacy' },
    rows: [controlRow(), {
      scenarioId: 'wide',
      scenarioName: 'wide',
      large: true,
      sourceBytes: 100,
      dimensions: { items: 1, fields: 1, nestedObjects: 0, arrayLength: 0, operations: 1 },
      implementations: {
        legacy: measurement(12, 900, 1),
        engine: measurement(durationMs, cacheRetainedBytes, peakRssDeltaBytes),
      },
    }],
  }))
}

/** Create required empty-lifecycle control for synthetic reports. */
function controlRow(): any {
  return {
    scenarioId: 'empty-lifecycle',
    scenarioName: 'empty',
    large: false,
    sourceBytes: 0,
    dimensions: { items: 1, fields: 0, nestedObjects: 0, arrayLength: 0, operations: 1 },
    implementations: { legacy: measurement(1, 10, 0), engine: measurement(1, 10, 0) },
  }
}

/** Create one compact synthetic measurement. */
function measurement(durationMs: number, cacheRetainedBytes: number, peakRssDeltaBytes: number): any {
  return {
    checkpoints: { moduleHeapBytes: 0, inputHeapBytes: 0, retainedHeapBytes: cacheRetainedBytes, teardownHeapBytes: 0, rssBeforeBytes: 0, rssAfterBytes: peakRssDeltaBytes },
    durationMs,
    inputRetainedBytes: 0,
    cacheRetainedBytes,
    peakRssDeltaBytes,
    teardownResidualBytes: 0,
  }
}
