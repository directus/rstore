import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { effectScope } from 'vue'
import { createStore } from '../src'

/**
 * Per-write cost of retaining a non-collecting query's live result.
 *
 * Queries with `experimentalGarbageCollection: false` own every cached row
 * they show. This measures one cache write against such a query, with and
 * without relation includes, plus the time to open the query, and validates
 * that a synchronous sweep keeps every visible row afterwards.
 */

const sizes = [1000, 5000]
const writes = 50
const warmupWrites = 5

/** Write kinds measured against one open query. */
const scenarios = ['related-field', 'new-related', 'root-field', 'new-root'] as const
type Scenario = typeof scenarios[number]

/** Build authors with one post each, open the query and time single writes. */
async function measure(size: number, scenario: Scenario, include: boolean) {
  const store = await createStore({
    plugins: [],
    experimentalGarbageCollection: true,
    schema: [
      { name: 'authors', relations: { posts: { many: true, to: { posts: { on: { authorId: 'id' } } } } } },
      { name: 'posts', relations: { author: { to: { authors: { on: { id: 'authorId' } } } } } },
    ],
  }) as any
  const scope = effectScope()
  try {
    const authors = store.$collections.find((c: any) => c.name === 'authors')
    const posts = store.$collections.find((c: any) => c.name === 'posts')
    store.$cache.writeItems({ collection: authors, items: Array.from({ length: size }, (_, i) => ({ key: `a${i}`, value: { id: `a${i}`, name: `Author ${i}` } })) })
    store.$cache.writeItems({ collection: posts, items: Array.from({ length: size }, (_, i) => ({ key: `p${i}`, value: { id: `p${i}`, authorId: `a${i}`, title: 'before' } })) })
    const openStart = performance.now()
    const query = await scope.run(() => store.authors.query((q: any) => q.many({
      fetchPolicy: 'cache-only',
      include: include ? { posts: true } : undefined,
      experimentalGarbageCollection: false,
    })))
    assert.equal(query.data.value.length, size)
    const openMs = performance.now() - openStart

    /** Apply write `i` of the scenario and read the query like a renderer. */
    const write = (i: number) => {
      const index = i % size
      switch (scenario) {
        case 'related-field':
          store.$cache.writeItem({ collection: posts, key: `p${index}`, item: { id: `p${index}`, authorId: `a${index}`, title: `t${i}` } })
          break
        case 'new-related':
          store.$cache.writeItem({ collection: posts, key: `n${i}`, item: { id: `n${i}`, authorId: `a${index}`, title: 'new' } })
          break
        case 'root-field':
          store.$cache.writeItem({ collection: authors, key: `a${index}`, item: { id: `a${index}`, name: `n${i}` } })
          break
        case 'new-root':
          store.$cache.writeItem({ collection: authors, key: `x${i}`, item: { id: `x${i}`, name: 'new' } })
          break
      }
      void query.data.value
    }

    for (let i = 0; i < warmupWrites; i++) write(i)
    const samples: number[] = []
    for (let i = warmupWrites; i < warmupWrites + writes; i++) {
      const start = performance.now()
      write(i)
      samples.push(performance.now() - start)
    }

    // Semantics: a synchronous sweep must keep every visible root and relation.
    store.$cache.garbageCollect()
    const visible = query.data.value
    assert.equal(visible.length, scenario === 'new-root' ? size + warmupWrites + writes : size)
    if (include) {
      const related = visible.reduce((count: number, author: any) => count + author.posts.length, 0)
      assert.equal(related, scenario === 'new-related' ? size + warmupWrites + writes : size)
    }

    samples.sort((a, b) => a - b)
    return { size, scenario, include, openMs: Number(openMs.toFixed(2)), medianMs: Number(samples[Math.floor(samples.length / 2)]!.toFixed(3)) }
  }
  finally {
    scope.stop()
    store.$cache.dispose()
  }
}

/** Measure every size, scenario and include mode, then print the report. */
async function main() {
  const results = []
  for (const size of sizes) {
    for (const scenario of scenarios) {
      for (const include of [false, true])
        results.push(await measure(size, scenario, include))
    }
  }
  console.table(results)
  console.log(JSON.stringify({ benchmark: '@rstore/vue visible query ownership per write', node: process.version, writes, results }))
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
