import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Configuration for one benchmark worker process. */
export interface WorkerProcessOptions<TResult> {
  /** Environment inherited by the worker before its result path is added. */
  environment?: NodeJS.ProcessEnv
  /** Maximum captured child-process output in bytes. */
  maxBuffer: number
  /** Node flags used to start this worker process. */
  nodeFlags?: readonly string[]
  /** JSON-serializable worker request passed as its final argument. */
  request: unknown
  /** Prefix used for the controller-owned temporary result directory. */
  resultPrefix: string
  /** Validates benchmark-specific result identity before it is returned. */
  validateResult: (result: TResult) => void
  /** Absolute path of the Vite Node worker entrypoint. */
  workerPath: string
  /** Working directory used for Vite config resolution and child execution. */
  workingDirectory?: string
}

/** Injectable worker-process boundaries for focused controller tests. */
export interface WorkerProcessActions {
  /** Creates one controller-owned output directory for a worker result. */
  createOutputDirectory: (prefix: string) => Promise<string>
  /** Executes one child process with bounded captured output. */
  execute: (command: string, args: string[], options: { cwd: string, env: NodeJS.ProcessEnv, maxBuffer: number }) => Promise<unknown>
  /** Reads the persisted JSON result after a successful worker process. */
  readOutput: (path: string) => Promise<string>
  /** Removes the exact controller-owned output directory. */
  removeOutputDirectory: (path: string) => Promise<void>
  /** Resolves the Vite Node command used to execute TypeScript workers. */
  resolveViteNode: () => string
}

/** Default Node process and filesystem operations used by benchmark runners. */
const defaultWorkerProcessActions: WorkerProcessActions = {
  createOutputDirectory: prefix => mkdtemp(join(tmpdir(), prefix)),
  execute: (command, args, options) => execFileAsync(command, args, options),
  readOutput: path => readFile(path, 'utf8'),
  removeOutputDirectory: path => rm(path, { force: true, recursive: true }),
  resolveViteNode: () => createRequire(import.meta.url).resolve('vite-node/cli'),
}

/**
 * Runs one isolated benchmark worker and reads its persisted JSON output.
 *
 * Scheduling, result pairing, and benchmark-specific identity diagnostics
 * remain in each runner; this helper owns only identical process transport.
 */
export async function runIsolatedWorkerProcess<TResult>(
  options: WorkerProcessOptions<TResult>,
  actions: WorkerProcessActions = defaultWorkerProcessActions,
): Promise<TResult> {
  const workingDirectory = options.workingDirectory ?? process.cwd()
  const outputDirectory = await actions.createOutputDirectory(options.resultPrefix)
  const outputPath = join(outputDirectory, 'result.json')
  try {
    await actions.execute(process.execPath, [
      ...(options.nodeFlags ?? ['--expose-gc']),
      actions.resolveViteNode(),
      '--config',
      resolve(workingDirectory, 'vitest.config.ts'),
      options.workerPath,
      JSON.stringify(options.request),
    ], {
      cwd: workingDirectory,
      env: {
        ...(options.environment ?? process.env),
        RSTORE_BENCHMARK_RESULT_PATH: outputPath,
      },
      maxBuffer: options.maxBuffer,
    })
    const result = JSON.parse(await actions.readOutput(outputPath)) as TResult
    options.validateResult(result)
    return result
  }
  finally {
    await actions.removeOutputDirectory(outputDirectory)
  }
}
