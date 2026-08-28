import type { MemoryCheckpoints, MemoryMeasurement, MemoryWorkerResult } from '../benchmark/memory/types'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertExposedGc, captureStableHeap } from '../benchmark/memory/gc'
import { QUICK_MEMORY_PROFILE } from '../benchmark/memory/profiles'
import { calculateMemoryMeasurement, classifyMemoryParity, classifyRetainedGrowth, controlAdjustedDelta, summarizeMemoryMeasurements } from '../benchmark/memory/report'
import { runMemoryProfile, selectMemoryRows } from '../benchmark/memory/runner'
import { finishMemoryScenario } from '../benchmark/memory/scenario-runtime'
import { assertOwnedTemporaryPath, cleanupMemoryController, historicalPreparationCommands } from '../benchmark/memory/version-runner'

describe('memory benchmark measurements', () => {
  it('requires explicit garbage collection', () => {
    expect(() => assertExposedGc(undefined)).toThrow('node --expose-gc')
    expect(() => assertExposedGc(() => {})).not.toThrow()
  })

  it('captures a finite stable heap value', async () => {
    await expect(captureStableHeap(() => {})).resolves.toSatisfy(Number.isFinite)
  })

  it('preserves signed retained-heap deltas', () => {
    const checkpoints: MemoryCheckpoints = {
      baselineBytes: 1_000,
      setupBytes: 1_500,
      steadyBytes: 1_400,
      growthBytes: 1_350,
      teardownBytes: 900,
    }

    expect(calculateMemoryMeasurement(checkpoints, 10)).toEqual({
      checkpoints,
      setupRetainedBytes: 500,
      steadyRetainedBytes: 400,
      growthBytes: -50,
      growthBytesPerUnit: -5,
      teardownResidualBytes: -100,
    })
  })

  it('summarizes values without hiding negative noise', () => {
    const measurements = [-10, 30, 20].map(growthBytes => measurement(growthBytes))
    const summary = summarizeMemoryMeasurements(measurements)

    expect(summary.growthBytes).toEqual({ median: 20, range: [-10, 30] })
    expect(summary.steadyRetainedBytes).toEqual({ median: 400, range: [400, 400] })
  })

  it('reports growth only above matching empty-control envelope', () => {
    expect(classifyRetainedGrowth([100, 120, 110], [-20, 10, 15])).toBe('growth detected')
    expect(classifyRetainedGrowth([5, 20, 30], [-20, 10, 15])).toBe('inconclusive')
    expect(classifyRetainedGrowth([-50, -20, -10], [-20, 10, 15])).toBe('inconclusive')
  })

  it('applies practical retained-memory parity without dividing noisy values', () => {
    expect(classifyMemoryParity([900_000, 950_000, 1_000_000], [1_000_000, 1_000_000, 1_000_000])).toBe('meets target')
    expect(classifyMemoryParity([1_000_000, 1_050_000, 1_060_000], [1_000_000, 1_000_000, 1_000_000])).toBe('near parity')
    expect(classifyMemoryParity([1_000_000, 1_066_000, 1_070_000], [1_000_000, 1_000_000, 1_000_000])).toBe('misses target')
    expect(classifyMemoryParity([-10, 20, 30], [-20, 10, 15])).toBe('near parity')
  })

  it('compares growth and teardown after matching control subtraction', () => {
    expect(controlAdjustedDelta([100, 120, 140], [10, 20, 30])).toEqual([90, 100, 110])
    expect(controlAdjustedDelta([-10, 20, 30], [-20, 10, 15])).toEqual([10, 10, 15])
  })

  it('keeps worker fixture structurally complete', () => {
    const result: MemoryWorkerResult = {
      scenarioId: 'records-only',
      scenarioName: 'records only',
      dimensions: { items: 1000, watchers: 0 },
      implementation: 'engine',
      unit: 'writes',
      warmupUnits: 10,
      growthUnits: 100,
      measurement: measurement(12),
    }
    expect(result.measurement.growthBytes).toBe(12)
  })

  it('runs control and records through isolated exposed-GC workers', async () => {
    const rows = QUICK_MEMORY_PROFILE.rows.slice(0, 2).map(row => ({
      ...row,
      dimensions: { ...row.dimensions, items: 10 },
    }))
    const result = await runMemoryProfile({ name: 'quick', rows }, 1)
    expect(result.reports[0]!.rows.map(row => row.scenarioId)).toEqual(['empty-control', 'records-only'])
    for (const row of result.reports[0]!.rows) {
      expect(row.implementations).toMatchObject({
        legacy: { checkpoints: expect.any(Object) },
        engine: { checkpoints: expect.any(Object) },
      })
    }
  }, 30_000)

  it('strictly validates focused diagnostic dimensions', () => {
    const previousScenario = process.env.RSTORE_MEMORY_SCENARIO
    const previousItems = process.env.RSTORE_MEMORY_ITEMS
    try {
      process.env.RSTORE_MEMORY_SCENARIO = 'records-only'
      process.env.RSTORE_MEMORY_ITEMS = '10.5'
      expect(() => selectMemoryRows(QUICK_MEMORY_PROFILE)).toThrow('must be an integer between')
      process.env.RSTORE_MEMORY_ITEMS = '10'
      expect(selectMemoryRows(QUICK_MEMORY_PROFILE)[0]!.dimensions.items).toBe(10)
    }
    finally {
      restoreEnvironment('RSTORE_MEMORY_SCENARIO', previousScenario)
      restoreEnvironment('RSTORE_MEMORY_ITEMS', previousItems)
    }
  })

  it('disposes scenario cache once across repeated teardown', () => {
    let disposals = 0
    const runtime = finishMemoryScenario({
      cache: { dispose: () => { disposals++ } },
    } as any, undefined, () => {})
    runtime.teardown()
    runtime.teardown()
    expect(disposals).toBe(1)
  })

  it('allows cleanup only for controller-owned worktree paths', () => {
    expect(() => assertOwnedTemporaryPath(join(tmpdir(), 'rstore-memory-test', 'worktree-dataCoreV1'))).not.toThrow()
    expect(() => assertOwnedTemporaryPath('/home/akryum/Projects/rstore')).toThrow('Refusing')
  })

  it('constructs locked historical install and serial build commands', () => {
    expect(historicalPreparationCommands()).toEqual([
      { command: 'pnpm', args: ['install', '--frozen-lockfile'], logSuffix: 'install.log' },
      { command: 'pnpm', args: ['--filter', '@rstore/shared', 'build'], logSuffix: 'shared-build.log' },
      { command: 'pnpm', args: ['--filter', '@rstore/core', 'build'], logSuffix: 'build.log' },
    ])
  })

  it('cleans owned worktrees but preserves diagnostic output after failure', async () => {
    const removed: string[] = []
    const temporaryRoot = join(tmpdir(), 'rstore-memory-test')
    const worktree = join(temporaryRoot, 'worktree-dataCoreV1')
    await cleanupMemoryController('/repository', temporaryRoot, new Set([worktree]), false, {
      removeWorktree: async (_root, path) => {
        removed.push(path)
      },
      removeTemporaryRoot: async (path) => {
        removed.push(path)
      },
    })
    expect(removed).toEqual([worktree])
  })

  it('removes controller output after complete success', async () => {
    const removed: string[] = []
    const temporaryRoot = join(tmpdir(), 'rstore-memory-test')
    await cleanupMemoryController('/repository', temporaryRoot, new Set(), true, {
      removeWorktree: async () => {},
      removeTemporaryRoot: async (path) => {
        removed.push(path)
      },
    })
    expect(removed).toEqual([temporaryRoot])
  })
})

/** Create one compact retained-memory measurement. */
function measurement(growthBytes: number): MemoryMeasurement {
  const checkpoints: MemoryCheckpoints = {
    baselineBytes: 100,
    setupBytes: 450,
    steadyBytes: 500,
    growthBytes: 500 + growthBytes,
    teardownBytes: 120,
  }
  return {
    checkpoints,
    setupRetainedBytes: 350,
    steadyRetainedBytes: 400,
    growthBytes,
    growthBytesPerUnit: growthBytes / 10,
    teardownResidualBytes: 20,
  }
}

/** Restore one optional environment variable. */
function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined)
    delete process.env[name]
  else process.env[name] = value
}
