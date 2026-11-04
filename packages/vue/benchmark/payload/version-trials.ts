import type { MemoryBenchmarkReport } from '../memory/types'
import type { BenchmarkReport } from '../runner'
import type { PayloadBenchmarkReport } from './types'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parseMemoryBenchmarkOutput } from '../memory/runner'
import { parseBenchmarkOutput } from '../version-report'
import { parsePayloadBenchmarkOutput } from './runner'

const execFileAsync = promisify(execFile)

/** Results from same-machine alternating version trials. */
export interface InterleavedVersionTrials {
  /** Three v5 CPU reports. */
  cpuV5: BenchmarkReport[]
  /** Three v6 CPU reports. */
  cpuV6: BenchmarkReport[]
  /** Three v5 retained-memory reports. */
  memoryV5: MemoryBenchmarkReport[]
  /** Three v6 retained-memory reports. */
  memoryV6: MemoryBenchmarkReport[]
  /** Five v5 payload reports. */
  payloadV5: PayloadBenchmarkReport[]
  /** Five v6 payload reports. */
  payloadV6: PayloadBenchmarkReport[]
}

/** Run CPU, memory, and payload trials with alternating version order. */
export async function runInterleavedVersionTrials(
  v5Root: string,
  v6Root: string,
  logs: string,
): Promise<InterleavedVersionTrials> {
  const cpu = await runPairs(v5Root, v6Root, logs, cpuSuite(), 3)
  const memory = await runPairs(v5Root, v6Root, logs, memorySuite(), 3)
  const payload = await runPairs(v5Root, v6Root, logs, payloadSuite(), 5)
  return {
    cpuV5: cpu.v5 as BenchmarkReport[],
    cpuV6: cpu.v6 as BenchmarkReport[],
    memoryV5: memory.v5 as MemoryBenchmarkReport[],
    memoryV6: memory.v6 as MemoryBenchmarkReport[],
    payloadV5: payload.v5 as PayloadBenchmarkReport[],
    payloadV6: payload.v6 as PayloadBenchmarkReport[],
  }
}

/** Description of one benchmark command and parser. */
interface TrialSuite<T> {
  /** Stable log stem. */
  name: string
  /** Benchmark entrypoint relative to Vue benchmark directory. */
  entry: string
  /** Environment overrides for one process. */
  environment: (trial: number) => NodeJS.ProcessEnv
  /** Parse one process report. */
  parse: (stdout: string) => T
}

/** Run one suite pair serially, alternating which version starts each trial. */
async function runPairs<T>(
  v5Root: string,
  v6Root: string,
  logs: string,
  suite: TrialSuite<T>,
  count: number,
): Promise<{ v5: T[], v6: T[] }> {
  const reports = { v5: [] as T[], v6: [] as T[] }
  const output = { v5: [] as string[], v6: [] as string[] }
  try {
    for (let trial = 0; trial < count; trial++) {
      const order = trial % 2 === 0
        ? [['v5', v5Root], ['v6', v6Root]] as const
        : [['v6', v6Root], ['v5', v5Root]] as const
      for (const [version, root] of order) {
        const result = await runTrial(root, suite.entry, suite.environment(trial))
        output[version].push(result.stdout, result.stderr)
        reports[version].push(suite.parse(result.stdout))
      }
    }
  }
  catch (error: any) {
    await writeSuiteLogs(logs, suite.name, output, `${error.stdout ?? ''}${error.stderr ?? ''}`)
    throw error
  }
  await writeSuiteLogs(logs, suite.name, output)
  return reports
}

/** Execute one isolated benchmark command using checkout-local vite-node. */
async function runTrial(root: string, entry: string, environment: NodeJS.ProcessEnv): Promise<{ stdout: string, stderr: string }> {
  const viteNode = join(root, 'node_modules/vite-node/vite-node.mjs')
  return execFileAsync(process.execPath, [viteNode, join(root, 'packages/vue/benchmark', entry)], {
    cwd: join(root, 'packages/vue'),
    env: environment,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
}

/** Build strict unfiltered environment for one benchmark family. */
function benchmarkEnvironment(clear: string[], values: Record<string, string>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...values }
  for (const key of clear)
    delete environment[key]
  return environment
}

/** Define existing full CPU suite. */
function cpuSuite(): TrialSuite<BenchmarkReport> {
  return {
    name: 'cpu',
    entry: 'full.ts',
    environment: () => benchmarkEnvironment(['RSTORE_BENCH_SCENARIO', 'RSTORE_BENCH_ITEMS'], {}),
    parse: parseBenchmarkOutput,
  }
}

/** Define retained-memory suite with one report per process. */
function memorySuite(): TrialSuite<MemoryBenchmarkReport> {
  return {
    name: 'memory',
    entry: 'memory-full.ts',
    environment: () => benchmarkEnvironment(
      ['RSTORE_MEMORY_SCENARIO', 'RSTORE_MEMORY_ITEMS'],
      { RSTORE_MEMORY_TRIALS: '1' },
    ),
    parse: stdout => parseMemoryBenchmarkOutput(stdout).reports[0]!,
  }
}

/** Define payload suite with alternating inner legacy/engine order. */
function payloadSuite(): TrialSuite<PayloadBenchmarkReport> {
  return {
    name: 'payload',
    entry: 'payload-full.ts',
    environment: trial => benchmarkEnvironment(
      ['RSTORE_PAYLOAD_SCENARIO', 'RSTORE_PAYLOAD_ITEMS', 'RSTORE_PAYLOAD_FIELDS'],
      { RSTORE_PAYLOAD_TRIALS: '1', RSTORE_PAYLOAD_TRIAL_OFFSET: String(trial) },
    ),
    parse: stdout => parsePayloadBenchmarkOutput(stdout).reports[0]!,
  }
}

/** Persist per-version command output and optional failure tail. */
async function writeSuiteLogs(
  directory: string,
  name: string,
  output: { v5: string[], v6: string[] },
  failure = '',
): Promise<void> {
  await Promise.all([
    writeFile(join(directory, `v5-${name}.log`), `${output.v5.join('')}${failure}`),
    writeFile(join(directory, `v6-${name}.log`), `${output.v6.join('')}${failure}`),
  ])
}
