import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { effectScope, watchEffect } from 'vue'
import { createScenarioRuntime, finishScenario, invariant, seedScenarioItems, TODO_SCHEMA } from './scenario-harness'

/** Build field writes with no reactive item, list, or index consumer. */
export function fieldWriteWithoutConsumer(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items)
  return finishScenario(runtime, undefined, options.items, (index) => {
    const key = (index % options.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index } })
  })
}

/** Build repeated writes to one exact item dependency. */
export function fieldWriteWithExactItemInterest(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items)
  const scope = effectScope()
  scope.run(() => watchEffect(() => {
    void (runtime.cache.readItem({ collection, key: 1 }) as any)?.n
    runtime.counts.item++
  }, { flush: 'sync' }))
  return finishScenario(runtime, scope, options.items, (index) => {
    runtime.cache.writeItem({ collection, key: 1, item: { id: 1, n: index } })
  }, () => invariant(runtime.counts.item > 0, 'exact item reader did not rerun'))
}

/** Build rejected stale CRDT writes with one exact item consumer. */
export function crdtStaleWriteWithItemInterest(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items)
  const storedTimestamp = 1_000_000_000
  for (let key = 1; key <= options.items; key++) {
    runtime.cache.writeItem({ collection, key, item: { id: key, n: 7 }, fieldTimestamps: { n: storedTimestamp } })
  }
  const scope = effectScope()
  scope.run(() => watchEffect(() => {
    void (runtime.cache.readItem({ collection, key: 1 }) as any)?.n
    runtime.counts.item++
  }, { flush: 'sync' }))
  return finishScenario(runtime, scope, options.items, (index) => {
    runtime.cache.writeItem({ collection, key: 1, item: { id: 1, n: -index }, fieldTimestamps: { n: index + 1 } })
  }, () => {
    if (implementation.name === 'engine')
      invariant(runtime.counts.item === 0, 'stale CRDT write invalidated item reader')
  })
}

/** Build hydration while one externally retained wrapper owns an active cell. */
export function hydrateWithRetainedWrapper(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  const state = runtime.cache.getState()
  const retained = runtime.cache.readItem({ collection, key: 1 }) as any
  void retained.n
  return finishScenario(runtime, undefined, options.items, () => {
    runtime.cache.setState(state)
  }, () => invariant(retained.id === 1, 'retained wrapper became stale after hydration'))
}
