import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { computed, effectScope } from 'vue'
import { createStore } from '../src'

/**
 * Cost of rebuilding a whole-collection cache read after its membership
 * changes. Every row add or delete invalidates the collection list, and the
 * next read materializes the full wrapper array again.
 */

const sizes = Number(process.env.RSTORE_BENCH_ITEMS) ? [Number(process.env.RSTORE_BENCH_ITEMS)] : [1000, 10000, 50000]
const writes = 40
const warmupWrites = 5

/** Membership changes measured against one reactive whole-collection reader. */
const scenarios = ['add-row', 'delete-row'] as const
type Scenario = typeof scenarios[number]

/** Fill one collection, keep a computed reader alive and time write + reread. */
async function measure(size: number, scenario: Scenario) {
  const store = await createStore({ plugins: [], schema: [{ name: 'items' }] }) as any
  const scope = effectScope()
  try {
    const collection = store.$collections.find((c: any) => c.name === 'items')
    store.$cache.writeItems({ collection, items: Array.from({ length: size }, (_, i) => ({ key: i, value: { id: i, label: `Item ${i}` } })) })
    const list = scope.run(() => computed(() => store.$cache.readItems({ collection })))!
    assert.equal(list.value.length, size)
    const first = list.value[0]

    /** Apply membership change `i` and read the list like a renderer. */
    const write = (i: number) => {
      if (scenario === 'add-row')
        store.$cache.writeItem({ collection, key: size + i, item: { id: size + i, label: 'new' } })
      else
        store.$cache.deleteItem({ collection, key: size - 1 - i })
      return list.value.length
    }

    for (let i = 0; i < warmupWrites; i++) write(i)
    const samples: number[] = []
    for (let i = warmupWrites; i < warmupWrites + writes; i++) {
      const start = performance.now()
      write(i)
      samples.push(performance.now() - start)
    }

    // Semantics: the rebuilt list keeps every surviving wrapper identity.
    const total = warmupWrites + writes
    assert.equal(list.value.length, scenario === 'add-row' ? size + total : size - total)
    assert.equal(list.value[0], first)
    samples.sort((a, b) => a - b)
    return { size, scenario, medianMs: Number(samples[Math.floor(samples.length / 2)]!.toFixed(3)) }
  }
  finally {
    scope.stop()
    store.$cache.dispose()
  }
}

/** Measure every size and scenario, then print the report. */
async function main() {
  const results = []
  for (const size of sizes) {
    for (const scenario of scenarios)
      results.push(await measure(size, scenario))
  }
  console.table(results)
  console.log(JSON.stringify({ benchmark: '@rstore/vue whole-collection list rebuild', node: process.version, writes, results }))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
