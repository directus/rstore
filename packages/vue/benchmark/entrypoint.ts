import type { BenchmarkProfile } from './profiles'
import type { CacheImplementation } from './runtime'
import process from 'node:process'
import { createCache as createEngineCache } from '../src/cache'
import { createCache as createLegacyCache } from './legacy-cache-loader.js'
import { runBenchmarks } from './runner'

/** Stable legacy and Data Core implementations shared by benchmarks and tests. */
export const BENCHMARK_IMPLEMENTATIONS: readonly [CacheImplementation, CacheImplementation] = [
  { name: 'legacy', create: createLegacyCache as CacheImplementation['create'] },
  { name: 'engine', create: createEngineCache as CacheImplementation['create'] },
]

/** Run one benchmark profile and preserve a nonzero process status on failure. */
export async function runBenchmarkProfile(profile: BenchmarkProfile): Promise<void> {
  try {
    await runBenchmarks(profile, BENCHMARK_IMPLEMENTATIONS)
  }
  catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
