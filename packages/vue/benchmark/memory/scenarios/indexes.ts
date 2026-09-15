import type { CacheImplementation } from '../../runtime'
import type { ScenarioRuntime } from '../../scenario-harness'
import type { MemoryDimensions, MemoryScenarioRuntime } from '../types'
import { effectScope, watchEffect } from 'vue'
import { BLOG_SCHEMA, createScenarioRuntime, invariant, VENUE_SCHEMA } from '../../scenario-harness'
import { finishMemoryScenario, stateCollectionSize } from '../scenario-runtime'

/** Build one materialized scalar-index result with membership churn. */
export function scalarIndexReader(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  seedScalarBuckets(runtime, dimensions.items, 10)
  const scope = effectScope()
  scope.run(() => watchEffect(() => {
    void runtime.cache.readItems({ collection: comment, indexKey: 'postId', indexValue: '0' }).length
    runtime.counts.relation++
  }, { flush: 'sync' }))
  return finishMemoryScenario(runtime, scope, (index) => {
    runtime.cache.writeItem({ collection: comment, key: 1, item: { id: 1, postId: index % 2 } })
  }, () => {
    invariant(stateCollectionSize(runtime, comment.name) === dimensions.items, 'scalar index cardinality drifted')
    invariant(runtime.counts.relation > 0, 'scalar index reader did not run')
  })
}

/** Build one materialized composite-index result with membership churn. */
export function compositeIndexReader(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, VENUE_SCHEMA)
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  seedCompositeBuckets(runtime, dimensions.items, 10)
  const scope = effectScope()
  scope.run(() => watchEffect(() => {
    void runtime.cache.readItems({ collection: event, indexKey: 'city:room', indexValue: 'city-0:room-0' }).length
    runtime.counts.relation++
  }, { flush: 'sync' }))
  return finishMemoryScenario(runtime, scope, (index) => {
    const target = index % 2
    runtime.cache.writeItem({
      collection: event,
      key: 1,
      item: { id: 1, city: `city-${target}`, room: `room-${target}` },
    })
  }, () => {
    invariant(stateCollectionSize(runtime, event.name) === dimensions.items, 'composite index cardinality drifted')
    invariant(runtime.counts.relation > 0, 'composite index reader did not run')
  })
}

/** Build a relation wrapper with one live relation reader. */
export function relationReader(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const post = runtime.collections.find(collection => collection.name === 'Post')!
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  runtime.cache.writeItem({ collection: post, key: 1, item: { id: 1 } })
  seedScalarBuckets(runtime, dimensions.items, 2)
  const scope = effectScope()
  scope.run(() => watchEffect(() => {
    void (runtime.cache.readItem({ collection: post, key: 1 }) as any)?.comments?.length
    runtime.counts.relation++
  }, { flush: 'sync' }))
  return finishMemoryScenario(runtime, scope, (index) => {
    runtime.cache.writeItem({ collection: comment, key: 1, item: { id: 1, postId: index % 2 } })
  }, () => {
    invariant(stateCollectionSize(runtime, comment.name) === dimensions.items, 'relation reader cardinality drifted')
    invariant(runtime.counts.relation > 0, 'relation reader did not run')
  })
}

/** Materialize hundreds of distinct cacheable exact-index buckets. */
export function indexResultChurn(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const bucketCount = Math.floor(dimensions.items / 8)
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  seedScalarBuckets(runtime, dimensions.items, bucketCount)
  let checksum = 0
  return finishMemoryScenario(runtime, undefined, (index) => {
    const bucket = index % bucketCount
    checksum += runtime.cache.readItems({ collection: comment, indexKey: 'postId', indexValue: String(bucket) }).length
  }, () => {
    invariant(bucketCount >= 512, 'index-result churn requires at least 512 buckets')
    invariant(stateCollectionSize(runtime, comment.name) === dimensions.items, 'index-result churn cardinality drifted')
    invariant(checksum >= 0, 'index-result checksum became invalid')
  })
}

/** Seed scalar buckets with stable minimum bucket cardinality. */
function seedScalarBuckets(runtime: ScenarioRuntime, count: number, bucketCount: number): void {
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  runtime.cache.writeItems({
    collection: comment,
    items: Array.from({ length: count }, (_, index) => {
      const id = index + 1
      return { key: id, value: { id, postId: index % bucketCount, n: 0 } }
    }),
  })
}

/** Seed composite buckets through unambiguous joined-string values. */
function seedCompositeBuckets(runtime: ScenarioRuntime, count: number, bucketCount: number): void {
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  runtime.cache.writeItems({
    collection: event,
    items: Array.from({ length: count }, (_, index) => {
      const id = index + 1
      const bucket = index % bucketCount
      return { key: id, value: { id, city: `city-${bucket}`, room: `room-${bucket}`, n: 0 } }
    }),
  })
}
