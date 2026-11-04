import type { Cache, CacheLayer } from '@rstore/shared'
import type { CacheImplementation } from '../benchmark/runtime'
import { describe, expect, it } from 'vitest'
import { createCache as createLegacyCache } from '../benchmark/legacy-cache-loader.js'
import { createCacheRuntime } from '../benchmark/runtime'
import { createCache as createEngineCache } from '../src/cache'

const SCHEMA = [
  {
    name: 'Post',
    relations: {
      comments: { many: true, to: { Comment: { on: { postId: 'id' } } } },
    },
  },
  { name: 'Comment' },
]

const IMPLEMENTATIONS: readonly CacheImplementation[] = [
  { name: 'legacy', create: createLegacyCache as CacheImplementation['create'] },
  { name: 'engine', create: createEngineCache as CacheImplementation['create'] },
]

/** Serializable semantic result excluding documented snapshot representation changes. */
interface TraceResult {
  /** Base collections, markers, and query metadata. */
  state: Pick<ReturnType<Cache['getState']>, 'collections' | 'markers' | 'queryMeta'>
  /** Current relation membership normalized across key aliases and set order. */
  relatedIds: string[]
  /** Layered item value after hydration. */
  layeredLabel: string
  /** Exact tombstone values. */
  tombstones: unknown[]
  /** Migrated module state. */
  moduleCount: number
  /** Stable public hook projection. */
  events: unknown[]
}

describe('cache differential trace', () => {
  it('keeps legacy and engine semantics aligned across a seeded trace', () => {
    const results = IMPLEMENTATIONS.map(runTrace)
    expect(results[1]).toEqual(results[0])
  })
})

/** Execute deterministic writes, aliases, layers, indexes, snapshots, and hooks. */
function runTrace(implementation: CacheImplementation): TraceResult {
  const events: unknown[] = []
  const runtime = createCacheRuntime(implementation, SCHEMA as any, (name, payload) => {
    events.push({
      name,
      collection: payload.collection?.name,
      key: payload.key == null ? payload.key : String(payload.key),
      operation: payload.operation,
      layer: payload.layer?.id,
    })
  })
  const { cache } = runtime
  const post = runtime.collections.find(collection => collection.name === 'Post')!
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  cache.writeItem({ collection: post, key: 1, item: { id: 1, title: 'seed' }, marker: 'posts' })
  cache.writeItems({
    collection: comment,
    marker: 'comments',
    items: Array.from({ length: 8 }, (_, index) => ({
      key: index + 1,
      value: { id: index + 1, postId: index < 3 ? 1 : 2, value: 0 },
    })),
  })

  let seed = 0x5EED
  for (let index = 0; index < 24; index++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const key = (seed % 8) + 1
    cache.writeItem({
      collection: comment,
      key: index % 2 ? String(key) : key,
      item: { id: key, postId: key <= 3 ? 1 : 2, value: seed % 1000 },
    })
  }
  cache.deleteItem({ collection: comment, key: 8, deletedAt: 100 })

  const layer: CacheLayer = {
    id: 'move-comment',
    collectionName: 'Comment',
    state: { 1: { postId: 2, label: 'layer' } },
    deletedItems: new Set(),
    optimistic: true,
  }
  cache.addLayer(layer)
  cache.removeLayer(layer.id)
  const counter = (cache as any).getModuleState('counter', 'main', { count: 1 }) as { count: number }
  counter.count++
  const relatedIds = Array.from(new Set(
    (cache.readItems({ collection: comment, indexKey: 'postId', indexValue: '1' }) as any[])
      .map(item => String(item.id)),
  )).sort()

  cache.addLayer({ ...layer, id: 'retained', state: { 1: { label: 'retained' } } })
  cache.setState({
    collections: {
      Post: { 1: { id: 1, title: 'hydrated' } },
      Comment: {
        1: { id: 1, postId: 1, value: 1 },
        2: { id: 2, postId: 1, value: 2 },
      },
    },
    markers: { posts: true, comments: true },
    modules: { 'counter:main': { count: 7 } },
    queryMeta: {},
  })

  const layeredLabel = (cache.readItem({ collection: comment, key: 1 }) as any).label
  const state = cache.getState()
  const tombstones = Array.from(cache.tombstones.entries(), ([, tombstone]) => ({ ...tombstone }))
  const moduleCount = ((cache as any).getModuleState('counter', 'main', { count: 0 }) as { count: number }).count
  cache.dispose()
  return {
    state: JSON.parse(JSON.stringify({
      collections: state.collections,
      markers: state.markers,
      queryMeta: state.queryMeta,
    })),
    relatedIds,
    layeredLabel,
    tombstones,
    moduleCount,
    events,
  }
}
