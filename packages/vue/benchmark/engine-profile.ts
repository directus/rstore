import type { BenchmarkProfile, BenchmarkScenario } from './profiles'
import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import process from 'node:process'
import { BENCHMARK_IMPLEMENTATIONS } from './entrypoint'
import { FULL_PROFILE, READ_REGRESSION_PROFILE, WRITE_DECOMPOSITION_PROFILE } from './profiles'
import { resolveScenarioItemCounts } from './runner'

const DEFAULT_DURATION_MS = 5_000

/** Run selected Data Core workloads alone for clean V8 CPU profiles. */
export function runEngineProfile(): void {
  const profile = process.env.RSTORE_BENCH_PROFILE === 'read' ? READ_REGRESSION_PROFILE : WRITE_DECOMPOSITION_PROFILE
  const selectedId = process.env.RSTORE_BENCH_SCENARIO
  const selectedItems = process.env.RSTORE_BENCH_ITEMS ? Number(process.env.RSTORE_BENCH_ITEMS) : undefined
  const duration = process.env.RSTORE_BENCH_DURATION ? Number(process.env.RSTORE_BENCH_DURATION) : DEFAULT_DURATION_MS
  const engine = BENCHMARK_IMPLEMENTATIONS[1]
  const scenarios = selectedId && !profile.scenarios.some(scenario => scenario.id === selectedId)
    ? FULL_PROFILE.scenarios
    : profile.scenarios
  for (const scenario of scenarios) {
    if (selectedId && scenario.id !== selectedId)
      continue
    for (const items of selectItemCounts(profile, scenario, selectedItems))
      profileScenario(engine, scenario, { items, watchers: profile.watchers }, duration)
  }
}

/** Select one explicit dimension or scenario profile dimensions. */
function selectItemCounts(profile: BenchmarkProfile, scenario: BenchmarkScenario, selectedItems?: number): readonly number[] {
  return selectedItems === undefined ? resolveScenarioItemCounts(profile, scenario) : [selectedItems]
}

/** Warm and repeatedly execute one engine workload until deadline. */
function profileScenario(implementation: CacheImplementation, scenario: BenchmarkScenario, options: ScenarioOptions, duration: number): void {
  const runtime = scenario.build(implementation, options)
  try {
    let index = runUntil(runtime, 200, 0)
    runtime.resetMeasurements()
    index = runUntil(runtime, duration, index)
    runtime.validate()
    console.log(`Profiled ${scenario.id} (${options.items}) through ${index} operations`)
  }
  finally {
    runtime.teardown()
  }
}

/** Execute cyclic operation indices for a bounded wall-clock interval. */
function runUntil(runtime: Scenario, duration: number, startIndex: number): number {
  const deadline = performance.now() + duration
  let index = startIndex
  do {
    for (let offset = 0; offset < 1_024; offset++) runtime.operation(index++)
  } while (performance.now() < deadline)
  return index
}

runEngineProfile()
