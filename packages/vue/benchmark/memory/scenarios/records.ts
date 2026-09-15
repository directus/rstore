import type { CacheImplementation } from '../../runtime'
import type { MemoryDimensions, MemoryScenarioRuntime } from '../types'
import { createScenarioRuntime, invariant, seedScenarioItems, TODO_SCHEMA } from '../../scenario-harness'
import { finishMemoryScenario, stateCollectionSize } from '../scenario-runtime'

/** Build seeded records without retaining public wrappers. */
export function recordsOnly(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items)
  return finishMemoryScenario(runtime, undefined, (index) => {
    const key = (index % dimensions.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, label: `item-${key}`, n: index } })
  }, () => invariant(stateCollectionSize(runtime, collection.name) === dimensions.items, 'record count changed'))
}

/** Build seeded records while retaining every materialized public wrapper. */
export function materializedWrappers(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items, 'all')
  const retained = runtime.cache.readItems({ collection, marker: 'all' }) as any[]
  let checksum = retained.reduce((sum, item) => sum + Number(item.id), 0)
  return finishMemoryScenario(runtime, undefined, (index) => {
    const key = (index % dimensions.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, label: `item-${key}`, n: index }, marker: 'all' })
    checksum += Number(retained[index % retained.length]?.n ?? 0)
  }, () => {
    invariant(retained.length === dimensions.items, 'materialized wrapper count changed')
    invariant(Number.isFinite(checksum), 'materialized wrapper checksum became invalid')
  })
}

/** Build repeated delete/reinsert state retaining causal tombstones. */
export function tombstoneState(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items, 'all')
  const present = new Set(Array.from({ length: dimensions.items }, (_, index) => index + 1))
  return finishMemoryScenario(runtime, undefined, (index) => {
    const key = (Math.floor(index / 2) % dimensions.items) + 1
    if (present.has(key)) {
      runtime.cache.deleteItem({ collection, key, deletedAt: index * 2 + 1 })
      present.delete(key)
    }
    else {
      runtime.cache.writeItem({
        collection,
        key,
        item: { id: key, n: index },
        marker: 'all',
        fieldTimestamps: { n: index * 2 + 2 },
      })
      present.add(key)
    }
  }, () => {
    invariant(stateCollectionSize(runtime, collection.name) === present.size, 'tombstone state cardinality drifted')
    invariant(runtime.cache.tombstones.size() === dimensions.items - present.size, 'tombstone ownership drifted')
  })
}

/** Build fixed-cardinality wrapper eviction and rematerialization churn. */
export function wrapperLifecycleChurn(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items, 'all')
  let checksum = 0
  return finishMemoryScenario(runtime, undefined, (index) => {
    const key = (index % dimensions.items) + 1
    runtime.cache.deleteItem({ collection, key })
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index }, marker: 'all' })
    checksum += Number((runtime.cache.readItem({ collection, key }) as any)?.id ?? 0)
  }, () => {
    invariant(stateCollectionSize(runtime, collection.name) === dimensions.items, 'wrapper churn changed cardinality')
    invariant(checksum >= 0, 'wrapper churn checksum became invalid')
  })
}
