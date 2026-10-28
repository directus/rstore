import type { BenchmarkProfile, BenchmarkScenario } from './profiles'
import process from 'node:process'

/** Resolve one workload's focused size matrix or inherit profile defaults. */
export function resolveScenarioItemCounts(profile: BenchmarkProfile, scenario: BenchmarkScenario): readonly number[] {
  return scenario.itemCounts ?? profile.itemCounts
}

/** Select benchmark rows through optional diagnostic environment filters. */
export function* selectBenchmarkRows(profile: BenchmarkProfile): Generator<readonly [BenchmarkScenario, number]> {
  const selectedScenario = process.env.RSTORE_BENCH_SCENARIO
  const selectedItems = process.env.RSTORE_BENCH_ITEMS ? Number(process.env.RSTORE_BENCH_ITEMS) : undefined
  for (const scenario of profile.scenarios) {
    if (selectedScenario && scenario.id !== selectedScenario)
      continue
    for (const items of selectedItems === undefined ? resolveScenarioItemCounts(profile, scenario) : [selectedItems])
      yield [scenario, items] as const
  }
}
