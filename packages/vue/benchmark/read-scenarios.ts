import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { BLOG_SCHEMA, createScenarioRuntime, finishScenario, invariant, seedScenarioItems, TODO_SCHEMA } from './scenario-harness'

/** Build repeated reads of one existing item. */
export function itemRead(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  let checksum = 0
  return finishScenario(runtime, undefined, options.items, (index) => {
    checksum += Number((runtime.cache.readItem({ collection, key: (index % options.items) + 1 }) as any)?.id ?? 0)
  }, () => {
    invariant(checksum > 0, 'item reads were not consumed')
  })
}

/** Build repeated full-list reads of base cache state. */
export function fullListRead(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  let checksum = 0
  return finishScenario(runtime, undefined, options.items, () => {
    checksum += runtime.cache.readItems({ collection, marker: 'all' }).length
  }, () => {
    invariant(checksum > 0, 'list reads were not consumed')
  })
}

/** Build deterministic filtered and limited list reads. */
export function filteredLimitedListRead(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  let checksum = 0
  return finishScenario(runtime, undefined, options.items, () => {
    checksum += runtime.cache.readItems({
      collection,
      marker: 'all',
      filter: item => Number((item as any).id) % 2 === 0,
      limit: 25,
    }).length
  }, () => {
    invariant(checksum > 0, 'filtered list reads were not consumed')
  })
}

/** Build indexed reads against a stable ten-percent relation bucket. */
export function indexedListRead(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  const bucketSize = Math.max(1, Math.floor(options.items / 10))
  for (let key = 1; key <= options.items; key++) {
    runtime.cache.writeItem({ collection: comment, key, item: { id: key, postId: key <= bucketSize ? 1 : 2 } })
  }
  let checksum = 0
  return finishScenario(runtime, undefined, options.items, () => {
    checksum += runtime.cache.readItems({ collection: comment, indexKey: 'postId', indexValue: '1' }).length
  }, () => {
    invariant(checksum > 0, 'indexed reads were not consumed')
  })
}
