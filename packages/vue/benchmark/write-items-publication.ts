import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { arch, cpus, platform, release } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { computed, watchSyncEffect } from 'vue'
import { assertLegacyPreconditions, createBenchmarkStore, createItems, legacyWriteItems } from './publicationStore'

const benchmarkName = '@rstore/vue writeItems atomic publication'
const itemCounts = [100, 1000]
const warmupIterations = 2
const measuredIterations = 20
const modes = ['legacy-per-item-control', 'optimized-public-writeItems'] as const

type Mode = typeof modes[number]

interface SampleResult {
  durationMs: number
  semanticDigest: string
  watcherNotifications: number
  visibleQueryTransitions: number
  queryRecomputations: number
  outerHookCalls: number
}

interface ModeMeasurements {
  rawMs: number[]
  structural: Omit<SampleResult, 'durationMs'>
}

interface ObservedCacheWrite {
  collection: { name: string }
  marker?: string
  operation: string
  result?: unknown
}

/** Normalize public wrapped rows for stable semantic comparison. */
function normalizeItems(items: any[]) {
  return items.map(item => ({
    id: item.id,
    group: item.group,
    name: item.name,
  }))
}

/** Measure one isolated write and assert its visible results and publications. */
async function runSample(itemCount: number, mode: Mode): Promise<SampleResult> {
  const { cache, runtime, store } = await createBenchmarkStore()
  const collection = store.$collections[0]!
  const items = createItems(itemCount)
  const expected = items.map(({ value }) => value)
  const marker = `benchmark-items-${itemCount}`
  const writeParams = { collection, items, marker }
  let queryRecomputations = 0
  let watcherNotifications = 0
  let visibleQueryTransitions = 0
  let previousQueryLength: number | undefined
  const observedCacheWrites: ObservedCacheWrite[] = []
  const query = computed(() => {
    queryRecomputations++
    return store.BenchmarkItems.peekMany()
  })
  const stopWatcher = watchSyncEffect(() => {
    const queryLength = query.value.length
    if (previousQueryLength !== undefined) {
      watcherNotifications++
      if (queryLength !== previousQueryLength) {
        visibleQueryTransitions++
      }
    }
    previousQueryLength = queryLength
  })
  store.$hooks.hook('afterCacheWrite', (payload: ObservedCacheWrite) => {
    if (payload.collection.name === collection.name) {
      observedCacheWrites.push(payload)
    }
  })

  try {
    if (mode === 'legacy-per-item-control') {
      assertLegacyPreconditions(runtime)
    }
    const startedAt = performance.now()
    if (mode === 'optimized-public-writeItems') {
      cache.writeItems(writeParams)
    }
    else {
      legacyWriteItems(runtime, writeParams)
    }
    const durationMs = performance.now() - startedAt

    const cacheItems = normalizeItems(cache.readItems({ collection, marker }))
    const queryItems = normalizeItems(query.value)
    assert.deepEqual(cacheItems, expected, `${mode} cache result differs from the deterministic input`)
    assert.deepEqual(queryItems, expected, `${mode} query result differs from the deterministic input`)
    assert.equal(observedCacheWrites.length, 1, `${mode} must emit exactly one afterCacheWrite hook`)
    const [cacheWrite] = observedCacheWrites
    assert.equal(cacheWrite!.collection, collection, `${mode} hook must identify the written collection`)
    assert.equal(cacheWrite!.marker, marker, `${mode} hook must retain the batch marker`)
    assert.equal(cacheWrite!.operation, 'write', `${mode} hook must report a write operation`)
    assert.equal(cacheWrite!.result, items, `${mode} hook must retain the complete batch result`)

    const expectedWatcherNotifications = mode === 'optimized-public-writeItems' ? 1 : itemCount * 3
    const expectedQueryRecomputations = expectedWatcherNotifications + 1
    const expectedVisibleTransitions = mode === 'optimized-public-writeItems' ? 1 : itemCount
    assert.equal(watcherNotifications, expectedWatcherNotifications, `${mode} watcher notification count changed`)
    assert.equal(queryRecomputations, expectedQueryRecomputations, `${mode} query recomputation count changed`)
    assert.equal(visibleQueryTransitions, expectedVisibleTransitions, `${mode} visible query transition count changed`)

    return {
      durationMs,
      semanticDigest: createHash('sha256').update(JSON.stringify(cacheItems)).digest('hex').slice(0, 16),
      watcherNotifications,
      visibleQueryTransitions,
      queryRecomputations,
      outerHookCalls: observedCacheWrites.length,
    }
  }
  finally {
    stopWatcher()
    cache.dispose()
  }
}

/** Alternate control and optimized order to reduce measurement bias. */
function getModeOrder(iteration: number): Mode[] {
  return iteration % 2 === 0 ? [...modes] : modes.toReversed()
}

/** Return the median from an already sorted nonempty sample. */
function medianOfSorted(sorted: number[]) {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

/** Compute a median without mutating measured samples. */
function median(values: number[]) {
  return medianOfSorted(values.toSorted((a, b) => a - b))
}

/** Report timing spread without introducing timing pass criteria. */
function summarize(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  const medianMs = medianOfSorted(sorted)
  const absoluteDeviations = sorted.map(value => Math.abs(value - medianMs))
  return {
    medianMs,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    madMs: median(absoluteDeviations),
    minMs: sorted[0]!,
    maxMs: sorted.at(-1)!,
  }
}

/** Round displayed timings while retaining the raw measurements for analysis. */
function round(value: number) {
  return Number(value.toFixed(3))
}

/** Round each timing summary field for JSON output. */
function roundSummary(summary: ReturnType<typeof summarize>) {
  return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, round(value)]))
}

/** Record Git and both benchmark source hashes for reproducibility. */
function getSourceMetadata() {
  const sourcePath = fileURLToPath(import.meta.url)
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  return {
    gitHead: git('rev-parse', 'HEAD'),
    worktreeDirty: git('status', '--porcelain', '--untracked-files=normal').length > 0,
    benchmarkSourceSha256: createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),
    benchmarkHelperSourceSha256: createHash('sha256').update(readFileSync(new URL('./publicationStore.ts', import.meta.url))).digest('hex'),
  }
}

/** Warm both modes, measure alternating samples, and require semantic parity. */
async function runSize(itemCount: number) {
  for (let iteration = 0; iteration < warmupIterations; iteration++) {
    for (const mode of getModeOrder(iteration)) {
      await runSample(itemCount, mode)
    }
  }

  const measurements: Record<Mode, { rawMs: number[], structural?: ModeMeasurements['structural'] }> = {
    'legacy-per-item-control': { rawMs: [], structural: undefined },
    'optimized-public-writeItems': { rawMs: [], structural: undefined },
  }

  for (let iteration = 0; iteration < measuredIterations; iteration++) {
    for (const mode of getModeOrder(iteration)) {
      const sample = await runSample(itemCount, mode)
      measurements[mode].rawMs.push(sample.durationMs)
      const { durationMs: _, ...structural } = sample
      if (measurements[mode].structural) {
        assert.deepEqual(structural, measurements[mode].structural, `${mode} structural evidence changed between samples`)
      }
      measurements[mode].structural = structural
    }
  }

  const legacy = measurements['legacy-per-item-control']
  const optimized = measurements['optimized-public-writeItems']
  assert(legacy.structural, 'Legacy control produced no measured structural evidence')
  assert(optimized.structural, 'Optimized path produced no measured structural evidence')
  assert.equal(legacy.structural.semanticDigest, optimized.structural.semanticDigest, 'Control and optimized cache/query results differ')
  const legacySummary = summarize(legacy.rawMs)
  const optimizedSummary = summarize(optimized.rawMs)

  return {
    itemCount,
    structuralEvidence: {
      'legacy-per-item-control': legacy.structural,
      'optimized-public-writeItems': optimized.structural,
    },
    timings: {
      'legacy-per-item-control': {
        rawMs: legacy.rawMs.map(round),
        summary: roundSummary(legacySummary),
      },
      'optimized-public-writeItems': {
        rawMs: optimized.rawMs.map(round),
        summary: roundSummary(optimizedSummary),
      },
      'medianSpeedup': round(legacySummary.medianMs / optimizedSummary.medianMs),
    },
  }
}

/** Run every configured size and emit machine-readable evidence. */
async function main() {
  const cpu = cpus()
  const results = []
  for (const itemCount of itemCounts) {
    results.push(await runSize(itemCount))
  }
  const output = {
    benchmark: benchmarkName,
    methodology: {
      itemCounts,
      warmupIterations,
      measuredIterations,
      isolatedStatePerSample: true,
      timingAssertions: false,
    },
    source: getSourceMetadata(),
    environment: {
      node: process.version,
      v8: process.versions.v8,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpu[0]?.model ?? 'unknown',
      logicalCpuCount: cpu.length,
    },
    results,
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
