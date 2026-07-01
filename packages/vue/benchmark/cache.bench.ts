import type { Cache, CacheLayer, ResolvedCollection } from '@rstore/shared'
import { normalizeCollectionRelations, resolveCollectionOppositeRelations, resolveCollections } from '@rstore/core'
import { bench, describe } from 'vitest'
import { effectScope, watchEffect } from 'vue'
import { createCache as createEngineCache } from '../src/cache'
import { createCache as createLegacyCache } from './legacy-cache'

/**
 * Benchmark: the previous Vue-reactivity cache (a per-collection version marker
 * bumped on *every* write, with list reads rebuilding a whole-collection
 * snapshot) vs the new framework-agnostic engine + fine-grained signal bridge.
 *
 * Two kinds of win are measured:
 *  - Reactivity granularity: a field write / unrelated-relation write re-runs
 *    *no* list query under the engine, vs every query under the legacy marker.
 *  - Read cost: even when reactivity must fire (insert / delete genuinely
 *    change the visible set), the engine resolves items incrementally instead
 *    of rebuilding the entire collection snapshot per read.
 */

type CacheFactory = (opts: { getStore: () => any, isServer?: boolean, tombstoneGc?: false }) => Cache

interface Counts { list: number, item: number, relation: number }
interface Scenario { counts: Counts, op: (i: number) => void, teardown: () => void }

const ITEMS = 1000
const WATCHERS = 20

const TODO_SCHEMA = [{ name: 'Todo' }]
const BLOG_SCHEMA = [
  { name: 'Post', relations: { comments: { many: true, to: { Comment: { on: { postId: 'id' } } } } } },
  { name: 'Comment' },
]

function newCounts(): Counts {
  return { list: 0, item: 0, relation: 0 }
}

/**
 * Wire a cache to a minimal store stub. Both implementations only reach the
 * store for collection lookup, child-collection resolution and (no-op) hooks,
 * so the stub isolates the storage + reactivity paths.
 */
function makeCtx(createCache: CacheFactory, schema: any[]) {
  const collections = resolveCollections(schema as any) as unknown as ResolvedCollection<any, any, any>[]
  normalizeCollectionRelations(collections as any)
  resolveCollectionOppositeRelations(collections as any)
  const store: any = {
    $collections: collections,
    $getCollection: (_item: any, names: string[]) => collections.find(c => names.includes(c.name)),
    $hooks: { callHookSync() {} },
  }
  // `tombstoneGc: false` avoids leaving a dangling GC interval after the bench.
  const cache = createCache({ getStore: () => store, isServer: false, tombstoneGc: false })
  store.$cache = cache
  return { cache, collections }
}

/** Seed `n` rows into a collection (optionally gated behind a marker). */
function seed(cache: Cache, collection: ResolvedCollection<any, any, any>, n: number, marker?: string) {
  for (let i = 1; i <= n; i++) {
    cache.writeItem({ collection, key: i, item: { id: i, label: `i${i}`, n: 0 }, marker })
  }
}

/** Mount `count` sync effects that each read the full visible list length. */
function mountListWatchers(cache: Cache, collection: ResolvedCollection<any, any, any>, count: number, counts: Counts) {
  for (let w = 0; w < count; w++) {
    watchEffect(() => {
      void cache.readItems({ collection, marker: 'all' }).length
      counts.list++
    }, { flush: 'sync' })
  }
}

// --- Scenario builders -------------------------------------------------------

/** Field write to an existing item while N list queries are live. */
function fieldWriteUnderLists(create: CacheFactory): Scenario {
  const { cache, collections } = makeCtx(create, TODO_SCHEMA)
  const collection = collections[0]!
  seed(cache, collection, ITEMS, 'all')
  const counts = newCounts()
  const scope = effectScope()
  scope.run(() => mountListWatchers(cache, collection, WATCHERS, counts))
  return {
    counts,
    op: (i) => {
      const key = (i % ITEMS) + 1
      cache.writeItem({ collection, key, item: { id: key, n: i } })
    },
    teardown: () => { scope.stop(); cache.dispose() },
  }
}

/** Field write while N single-item queries are live (item-level granularity). */
function fieldWriteUnderItems(create: CacheFactory): Scenario {
  const { cache, collections } = makeCtx(create, TODO_SCHEMA)
  const collection = collections[0]!
  seed(cache, collection, ITEMS)
  const counts = newCounts()
  const scope = effectScope()
  scope.run(() => {
    for (let w = 0; w < WATCHERS; w++) {
      const key = w + 1
      watchEffect(() => {
        const item = cache.readItem({ collection, key }) as any
        void (item ? item.n : 0)
        counts.item++
      }, { flush: 'sync' })
    }
  })
  return {
    counts,
    op: (i) => {
      const key = (i % ITEMS) + 1
      cache.writeItem({ collection, key, item: { id: key, n: i } })
    },
    teardown: () => { scope.stop(); cache.dispose() },
  }
}

/** Insert a brand-new item while N list queries are live (both must re-run). */
function insertUnderLists(create: CacheFactory): Scenario {
  const { cache, collections } = makeCtx(create, TODO_SCHEMA)
  const collection = collections[0]!
  seed(cache, collection, ITEMS, 'all')
  const counts = newCounts()
  const scope = effectScope()
  scope.run(() => mountListWatchers(cache, collection, WATCHERS, counts))
  return {
    counts,
    op: (i) => {
      const key = ITEMS + 1 + i
      cache.writeItem({ collection, key, item: { id: key, n: i }, marker: 'all' })
    },
    teardown: () => { scope.stop(); cache.dispose() },
  }
}

/** Delete an item while N list queries are live (both must re-run). */
function deleteUnderLists(create: CacheFactory): Scenario {
  const { cache, collections } = makeCtx(create, TODO_SCHEMA)
  const collection = collections[0]!
  seed(cache, collection, ITEMS, 'all')
  const counts = newCounts()
  const scope = effectScope()
  scope.run(() => mountListWatchers(cache, collection, WATCHERS, counts))
  return {
    counts,
    op: (i) => {
      cache.deleteItem({ collection, key: i + 1 })
    },
    teardown: () => { scope.stop(); cache.dispose() },
  }
}

/** Repeated full-list reads with an optimistic layer over 10% of the items. */
function listReadUnderLayer(create: CacheFactory): Scenario {
  const { cache, collections } = makeCtx(create, TODO_SCHEMA)
  const collection = collections[0]!
  seed(cache, collection, ITEMS, 'all')
  const state: Record<number, any> = {}
  for (let i = 1; i <= ITEMS; i += 10) {
    state[i] = { n: 999 }
  }
  const layer: CacheLayer = { id: 'opt', collectionName: collection.name, state, deletedItems: new Set(), optimistic: true }
  cache.addLayer(layer)
  return {
    counts: newCounts(),
    op: () => {
      void cache.readItems({ collection, marker: 'all' }).length
    },
    teardown: () => cache.dispose(),
  }
}

/**
 * A live query reads `post.comments` (resolved via the Comment `postId` index);
 * the workload writes comments belonging to a *different* post. The engine's
 * per-index-bucket signal means the reader does not re-run; the legacy marker
 * re-runs it on every Comment write.
 */
function relationUnrelatedWrites(create: CacheFactory): Scenario {
  const { cache, collections } = makeCtx(create, BLOG_SCHEMA)
  const post = collections.find(c => c.name === 'Post')!
  const comment = collections.find(c => c.name === 'Comment')!
  cache.writeItem({ collection: post, key: 1, item: { id: 1 } })
  for (let i = 1; i <= 10; i++) {
    cache.writeItem({ collection: comment, key: i, item: { id: i, postId: 1 } })
  }
  const counts = newCounts()
  const scope = effectScope()
  scope.run(() => {
    watchEffect(() => {
      const p = cache.readItem({ collection: post, key: 1 }) as any
      void p?.comments?.length
      counts.relation++
    }, { flush: 'sync' })
  })
  let nextKey = 10_000
  return {
    counts,
    op: () => {
      const key = nextKey++
      cache.writeItem({ collection: comment, key, item: { id: key, postId: 2 } })
    },
    teardown: () => { scope.stop(); cache.dispose() },
  }
}

// --- Deterministic report ----------------------------------------------------

/** Run `k` ops against a freshly-built scenario, capturing re-runs + wall time. */
function run(build: () => Scenario, k: number) {
  const s = build()
  s.counts.list = 0
  s.counts.item = 0
  s.counts.relation = 0
  const start = performance.now()
  for (let i = 0; i < k; i++) {
    s.op(i)
  }
  const ms = performance.now() - start
  s.teardown()
  return {
    listReruns: s.counts.list,
    itemReruns: s.counts.item,
    relationReruns: s.counts.relation,
    ms: Number(ms.toFixed(2)),
  }
}

const SCENARIOS: Array<{ name: string, build: (c: CacheFactory) => Scenario, k: number }> = [
  { name: `field write / ${WATCHERS} list watchers`, build: fieldWriteUnderLists, k: 100 },
  { name: `field write / ${WATCHERS} item watchers`, build: fieldWriteUnderItems, k: 100 },
  { name: `insert / ${WATCHERS} list watchers`, build: insertUnderLists, k: 100 },
  { name: `delete / ${WATCHERS} list watchers`, build: deleteUnderLists, k: 100 },
  { name: 'list read / optimistic layer', build: listReadUnderLayer, k: 500 },
  { name: 'relation read / unrelated writes', build: relationUnrelatedWrites, k: 100 },
]

const rows: any[] = []
for (const sc of SCENARIOS) {
  const legacy = run(() => sc.build(createLegacyCache as CacheFactory), sc.k)
  const engine = run(() => sc.build(createEngineCache as CacheFactory), sc.k)
  rows.push(
    { scenario: sc.name, ops: sc.k, impl: 'legacy', ...legacy, speedup: '1x' },
    { scenario: '', ops: '', impl: 'engine', ...engine, speedup: `${(legacy.ms / Math.max(engine.ms, 1e-6)).toFixed(0)}x` },
  )
}
// eslint-disable-next-line no-console
console.log(`\n=== deterministic workload (${ITEMS} items, ${WATCHERS} watchers) — re-runs + wall time ===`)
// eslint-disable-next-line no-console
console.table(rows)

// --- Throughput (vitest bench) ----------------------------------------------

describe(`throughput: field write under ${WATCHERS} live list watchers (${ITEMS} items)`, () => {
  const legacy = fieldWriteUnderLists(createLegacyCache as CacheFactory)
  const engine = fieldWriteUnderLists(createEngineCache as CacheFactory)
  let n = 0
  bench('legacy (collection marker)', () => legacy.op(n++))
  bench('engine (fine-grained)', () => engine.op(n++))
})

describe(`throughput: full-list read with optimistic layer (${ITEMS} items)`, () => {
  const legacy = listReadUnderLayer(createLegacyCache as CacheFactory)
  const engine = listReadUnderLayer(createEngineCache as CacheFactory)
  bench('legacy (snapshot rebuild)', () => legacy.op(0))
  bench('engine (incremental resolve)', () => engine.op(0))
})

describe(`throughput: relation read while writing unrelated items`, () => {
  const legacy = relationUnrelatedWrites(createLegacyCache as CacheFactory)
  const engine = relationUnrelatedWrites(createEngineCache as CacheFactory)
  let n = 0
  bench('legacy (collection marker)', () => legacy.op(n++))
  bench('engine (index bucket)', () => engine.op(n++))
})
