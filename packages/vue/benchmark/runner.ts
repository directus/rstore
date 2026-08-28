import type { Task, TaskResult } from 'tinybench'
import type { BenchmarkProfile, BenchmarkScenario } from './profiles'
import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioCounts, ScenarioOptions } from './scenario-harness'
import process from 'node:process'
import { Bench } from 'tinybench'
import { classifyComparison, createBenchmarkReport, speedupInterval } from './report'
import { selectBenchmarkRows } from './selection'

export { createBenchmarkReport, speedupInterval } from './report'
export { resolveScenarioItemCounts } from './selection'

const operationIndexes = new WeakMap<Scenario, number>()
const RETRY_DURATION_MULTIPLIERS = [4, 16, 32] as const

/** One implementation's normalized Tinybench result. */
export interface BenchmarkMeasurement {
  /** Implementation label. */
  implementation: string
  /** Operations executed per Tinybench task invocation. */
  batchSize: number
  /** Operations per second after batch normalization. */
  operationsPerSecond: number
  /** Mean operation time in microseconds. */
  meanMicroseconds: number
  /** Relative margin of error reported by Tinybench. */
  rme: number
  /** Number of collected Tinybench samples. */
  samples: number
  /** Validation-only reactive rerun counters. */
  counts: ScenarioCounts
  /** Mean-margin interval used for speedup classification. */
  meanMs: number
  /** Mean-margin interval used for speedup classification. */
  moeMs: number
}

/** One fully measured scenario used by console and JSON reporters. */
export interface BenchmarkScenarioResult {
  /** Stable scenario definition. */
  scenario: BenchmarkScenario
  /** Concrete workload dimensions. */
  options: ScenarioOptions
  /** Legacy and Data Core measurements. */
  measurements: readonly [BenchmarkMeasurement, BenchmarkMeasurement]
  /** Number of longer retries performed after initial measurement. */
  reruns: number
}

/** Serializable benchmark report for local and release comparison. */
export interface BenchmarkReport {
  /** Machine and benchmark configuration. */
  environment: {
    node: string
    platform: string
    arch: string
    profile: BenchmarkProfile['name']
    timeMs: number
    maxRme: number
  }
  /** Normalized scenario comparisons. */
  rows: Array<{
    scenarioId: string
    scenarioName: string
    dimensions: { items: number, watchers: number, observer?: BenchmarkScenario['observer'] }
    implementations: Record<string, Pick<BenchmarkMeasurement, 'meanMicroseconds' | 'operationsPerSecond' | 'rme' | 'samples' | 'batchSize' | 'counts'>>
    reruns: number
    speedupInterval: readonly [number, number]
    speedup: number
    verdict: 'engine faster' | 'legacy faster' | 'no clear difference' | 'noisy'
  }>
}

/** Run all profile workloads and print normalized comparison rows. */
export async function runBenchmarks(
  profile: BenchmarkProfile,
  implementations: readonly [CacheImplementation, CacheImplementation],
): Promise<BenchmarkReport> {
  printEnvironment(profile)
  const rows: BenchmarkMeasurement[] = []
  const results: BenchmarkScenarioResult[] = []
  let scenarioIndex = 0
  for (const [scenario, items] of selectBenchmarkRows(profile)) {
    const options = { items, watchers: profile.watchers }
    const result = await measureScenario(profile, scenario, options, implementations, scenarioIndex++)
    rows.push(...result.measurements)
    results.push(result)
    printScenario(profile, scenario, options, result.measurements)
  }
  console.log(`\nMeasured ${rows.length} implementation rows.`)
  const report = createBenchmarkReport(profile, results)
  console.log(JSON.stringify(report, null, 2))
  return report
}

/** Measure one equivalent scenario pair with escalating bounded retries. */
async function measureScenario(
  profile: BenchmarkProfile,
  scenario: BenchmarkScenario,
  options: ScenarioOptions,
  implementations: readonly [CacheImplementation, CacheImplementation],
  scenarioIndex: number,
): Promise<BenchmarkScenarioResult> {
  const verificationCounts = verifyScenario(scenario, options, implementations)
  let measurements = await runPair(profile, scenario, options, implementations, scenarioIndex, verificationCounts, 1)
  let reruns = 0
  for (const durationMultiplier of RETRY_DURATION_MULTIPLIERS) {
    if (!shouldRetryMeasurements(profile, measurements))
      break
    measurements = await runPair(profile, scenario, options, implementations, scenarioIndex, verificationCounts, durationMultiplier)
    reruns++
  }
  return { scenario, options, measurements, reruns }
}

/** Return whether any paired row exceeds configured uncertainty threshold. */
export function shouldRetryMeasurements(
  profile: BenchmarkProfile,
  measurements: readonly BenchmarkMeasurement[],
): boolean {
  return measurements.some(measurement => measurement.rme > profile.maxRme)
}

/** Validate bounded workload semantics outside all timed regions. */
function verifyScenario(
  scenario: BenchmarkScenario,
  options: ScenarioOptions,
  implementations: readonly CacheImplementation[],
): ReadonlyMap<string, ScenarioCounts> {
  const counts = new Map<string, ScenarioCounts>()
  for (const implementation of implementations) {
    const runtime = scenario.build(implementation, options)
    try {
      runtime.resetMeasurements()
      for (let index = 0; index < 10; index++) runtime.operation(index)
      runtime.validate(10)
      counts.set(implementation.name, runtime.counts())
    }
    finally {
      runtime.teardown()
    }
  }
  return counts
}

/** Run Tinybench with implementation-specific calibrated batch sizes. */
async function runPair(
  profile: BenchmarkProfile,
  scenario: BenchmarkScenario,
  options: ScenarioOptions,
  implementations: readonly [CacheImplementation, CacheImplementation],
  scenarioIndex: number,
  verificationCounts: ReadonlyMap<string, ScenarioCounts>,
  durationMultiplier: number,
): Promise<readonly [BenchmarkMeasurement, BenchmarkMeasurement]> {
  const batches = implementations.map(implementation => calibrateBatch(profile, scenario, options, implementation))
  const taskImplementations = scenarioIndex % 2 === 0 ? implementations : [implementations[1], implementations[0]] as const
  const taskBatches = scenarioIndex % 2 === 0 ? batches : [batches[1], batches[0]]
  const runtimes = new Map<string, Scenario>()
  const bench = new Bench({
    iterations: profile.iterations,
    time: profile.time * durationMultiplier,
    warmupIterations: profile.iterations,
    warmupTime: profile.warmupTime,
    setup(task) {
      const implementation = findImplementation(task, taskImplementations)
      const runtime = scenario.build(implementation, options)
      runtime.resetMeasurements()
      runtimes.set(task.name, runtime)
    },
    teardown(task) {
      const runtime = runtimes.get(task.name)
      if (!runtime) {
        return
      }
      try {
        runtime.validate()
      }
      finally {
        runtime.teardown()
        runtimes.delete(task.name)
      }
    },
  })
  for (let index = 0; index < taskImplementations.length; index++) {
    const implementation = taskImplementations[index]!
    const batchSize = taskBatches[index]!
    bench.add(implementation.name, () => runBatch(runtimes.get(implementation.name)!, batchSize))
  }
  await bench.run()
  return implementations.map((implementation) => {
    const task = bench.getTask(implementation.name)!
    return normalizeMeasurement(implementation.name, task.result!, batches[implementations.indexOf(implementation)]!, verificationCounts.get(implementation.name)!)
  }) as [BenchmarkMeasurement, BenchmarkMeasurement]
}

/** Find implementation associated with a Tinybench task name. */
function findImplementation(task: Task, implementations: readonly CacheImplementation[]): CacheImplementation {
  const implementation = implementations.find(candidate => candidate.name === task.name)
  if (!implementation) {
    throw new Error(`Unknown benchmark task: ${task.name}`)
  }
  return implementation
}

/** Calibrate a fresh bounded workload until timing exceeds clock noise. */
function calibrateBatch(
  profile: BenchmarkProfile,
  scenario: BenchmarkScenario,
  options: ScenarioOptions,
  implementation: CacheImplementation,
): number {
  const runtime = scenario.build(implementation, options)
  try {
    for (let index = 0; index < 10; index++) runtime.operation(index)
    runtime.resetMeasurements()
    let batchSize = 1
    while (batchSize < 16_384) {
      const start = performance.now()
      runBatch(runtime, batchSize)
      if (performance.now() - start >= profile.batchTargetMs)
        break
      batchSize *= 2
    }
    return batchSize
  }
  finally {
    runtime.teardown()
  }
}

/** Execute a cyclic group of benchmark operations. */
function runBatch(runtime: Scenario, batchSize: number): void {
  const startIndex = operationIndexes.get(runtime) ?? 0
  for (let offset = 0; offset < batchSize; offset++) {
    runtime.operation(startIndex + offset)
  }
  operationIndexes.set(runtime, startIndex + batchSize)
}

/** Convert Tinybench batch metrics into per-operation measurements. */
export function normalizeMeasurement(
  implementation: string,
  result: TaskResult,
  batchSize: number,
  counts: ScenarioCounts,
): BenchmarkMeasurement {
  return {
    implementation,
    batchSize,
    operationsPerSecond: result.hz * batchSize,
    meanMicroseconds: result.mean / batchSize * 1000,
    rme: result.rme,
    samples: result.samples.length,
    counts,
    meanMs: result.mean / batchSize,
    moeMs: result.moe / batchSize,
  }
}

/** Print machine context needed to interpret a local benchmark run. */
function printEnvironment(profile: BenchmarkProfile): void {
  console.log(`RStore cache benchmark (${profile.name})`)
  console.log(`node ${process.version}; ${process.platform}/${process.arch}; ${profile.time}ms samples; ${profile.maxRme}% RME retry threshold`)
}

/** Print one paired comparison with conservative speedup interval. */
function printScenario(profile: BenchmarkProfile, scenario: BenchmarkScenario, options: ScenarioOptions, measurements: readonly [BenchmarkMeasurement, BenchmarkMeasurement]): void {
  const [legacy, engine] = measurements
  const interval = speedupInterval(legacy, engine)
  const verdict = classifyComparison(profile, measurements, interval)
  console.table(measurements.map(measurement => ({
    'scenario': scenario.name,
    'items': options.items,
    'observers': formatObservers(scenario, options),
    'implementation': measurement.implementation,
    'batch': measurement.batchSize,
    'mean µs/op': measurement.meanMicroseconds.toFixed(3),
    'ops/s': Math.round(measurement.operationsPerSecond),
    'rme': `${measurement.rme.toFixed(2)}%`,
    'samples': measurement.samples,
    'counts': JSON.stringify(measurement.counts),
    'comparison': measurement.implementation === 'engine' ? `${(legacy.meanMs / engine.meanMs).toFixed(2)}x [${interval[0].toFixed(2)}, ${interval[1].toFixed(2)}] ${verdict}` : '',
  })))
}

/** Describe live readers without claiming unused watcher dimensions. */
function formatObservers(scenario: BenchmarkScenario, options: ScenarioOptions): string {
  if (scenario.observer === 'relation') {
    return '1 relation reader'
  }
  return scenario.observer ? `${options.watchers} ${scenario.observer} watchers` : ''
}
