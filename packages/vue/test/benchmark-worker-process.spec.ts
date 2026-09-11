import type { WorkerProcessActions } from '../benchmark/worker-process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { writeWorkerResult } from '../benchmark/worker-output'
import { runIsolatedWorkerProcess } from '../benchmark/worker-process'

interface WorkerResult {
  implementation: string
  scenarioId: string
}

describe('benchmark worker process', () => {
  it('keeps memory worker flags, environment, working directory, and buffer', async () => {
    const controller = createController()
    const request = { implementation: 'legacy', scenarioId: 'records-only' }

    const result = await runIsolatedWorkerProcess<WorkerResult>({
      environment: { INHERITED_VALUE: 'kept', RSTORE_BENCHMARK_RESULT_PATH: 'replaced' },
      maxBuffer: 4 * 1024 * 1024,
      request,
      resultPrefix: 'rstore-memory-worker-',
      validateResult: result => expect(result).toEqual(request),
      workerPath: '/repository/packages/vue/benchmark/memory/worker-entry.ts',
      workingDirectory: '/repository',
    }, controller.actions)

    expect(result).toEqual(request)
    expect(controller.createOutputDirectory).toHaveBeenCalledWith('rstore-memory-worker-')
    expect(controller.execute).toHaveBeenCalledWith(process.execPath, [
      '--expose-gc',
      'vite-node',
      '--config',
      '/repository/vitest.config.ts',
      '/repository/packages/vue/benchmark/memory/worker-entry.ts',
      JSON.stringify(request),
    ], {
      cwd: '/repository',
      env: {
        INHERITED_VALUE: 'kept',
        RSTORE_BENCHMARK_RESULT_PATH: '/tmp/rstore-worker-output/result.json',
      },
      maxBuffer: 4 * 1024 * 1024,
    })
    expect(controller.removeOutputDirectory).toHaveBeenCalledWith('/tmp/rstore-worker-output')
  })

  it('keeps payload worker 8 MiB output buffer', async () => {
    const controller = createController()

    await runIsolatedWorkerProcess<WorkerResult>({
      environment: {},
      maxBuffer: 8 * 1024 * 1024,
      request: { implementation: 'engine', scenarioId: 'wide' },
      resultPrefix: 'rstore-payload-worker-',
      validateResult: () => {},
      workerPath: '/repository/packages/vue/benchmark/payload/worker-entry.ts',
      workingDirectory: '/repository',
    }, controller.actions)

    expect(controller.createOutputDirectory).toHaveBeenCalledWith('rstore-payload-worker-')
    expect(controller.execute.mock.calls[0]?.[2]).toMatchObject({ maxBuffer: 8 * 1024 * 1024 })
  })

  it('rejects missing output and still removes controller-owned output', async () => {
    const controller = createController({
      readOutput: async () => {
        throw new Error('ENOENT: result.json')
      },
    })

    await expect(runWorker(controller.actions)).rejects.toThrow('ENOENT: result.json')
    expect(controller.removeOutputDirectory).toHaveBeenCalledWith('/tmp/rstore-worker-output')
  })

  it('rejects mismatched worker identity and still removes output', async () => {
    const controller = createController({
      result: { implementation: 'engine', scenarioId: 'records-only' },
    })

    await expect(runWorker(controller.actions)).rejects.toThrow('identity mismatch')
    expect(controller.removeOutputDirectory).toHaveBeenCalledWith('/tmp/rstore-worker-output')
  })

  it('propagates child failures and still removes output', async () => {
    const controller = createController({
      execute: async () => {
        throw new Error('worker exited 1')
      },
    })

    await expect(runWorker(controller.actions)).rejects.toThrow('worker exited 1')
    expect(controller.readOutput).not.toHaveBeenCalled()
    expect(controller.removeOutputDirectory).toHaveBeenCalledWith('/tmp/rstore-worker-output')
  })

  it('writes worker JSON to the configured result path', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'rstore-worker-output-'))
    const outputPath = join(outputDirectory, 'result.json')
    const previous = process.env.RSTORE_BENCHMARK_RESULT_PATH
    try {
      process.env.RSTORE_BENCHMARK_RESULT_PATH = outputPath
      await writeWorkerResult({ implementation: 'legacy', scenarioId: 'records-only' })
      expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual({ implementation: 'legacy', scenarioId: 'records-only' })
    }
    finally {
      if (previous === undefined)
        delete process.env.RSTORE_BENCHMARK_RESULT_PATH
      else process.env.RSTORE_BENCHMARK_RESULT_PATH = previous
      await rm(outputDirectory, { force: true, recursive: true })
    }
  })
})

/** Runs one request with the memory identity contract used by production. */
function runWorker(actions: WorkerProcessActions): Promise<WorkerResult> {
  return runIsolatedWorkerProcess({
    environment: {},
    maxBuffer: 4 * 1024 * 1024,
    request: { implementation: 'legacy', scenarioId: 'records-only' },
    resultPrefix: 'rstore-memory-worker-',
    validateResult: (result: WorkerResult) => {
      if (result.scenarioId !== 'records-only' || result.implementation !== 'legacy')
        throw new TypeError('identity mismatch')
    },
    workerPath: '/repository/packages/vue/benchmark/memory/worker-entry.ts',
    workingDirectory: '/repository',
  }, actions)
}

/** Creates an in-memory worker controller and exposes every boundary spy. */
function createController(overrides: Partial<{
  execute: WorkerProcessActions['execute']
  readOutput: WorkerProcessActions['readOutput']
  result: WorkerResult
}> = {}) {
  const createOutputDirectory = vi.fn(async () => '/tmp/rstore-worker-output')
  const execute = vi.fn(overrides.execute ?? (async () => {}))
  const readOutput = vi.fn(overrides.readOutput ?? (async () => JSON.stringify(overrides.result ?? {
    implementation: 'legacy',
    scenarioId: 'records-only',
  })))
  const removeOutputDirectory = vi.fn(async () => {})
  return {
    actions: {
      createOutputDirectory,
      execute,
      readOutput,
      removeOutputDirectory,
      resolveViteNode: () => 'vite-node',
    } satisfies WorkerProcessActions,
    createOutputDirectory,
    execute,
    readOutput,
    removeOutputDirectory,
  }
}
