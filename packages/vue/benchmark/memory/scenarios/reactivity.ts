import type { CacheImplementation } from '../../runtime'
import type { MemoryDimensions, MemoryScenarioRuntime } from '../types'
import { effectScope, watchEffect } from 'vue'
import { createScenarioRuntime, invariant, mountListWatchers, seedScenarioItems, TODO_SCHEMA } from '../../scenario-harness'
import { finishMemoryScenario, stateCollectionSize } from '../scenario-runtime'

/** Build exact-item reactive owners over seeded records. */
export function itemWatchers(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items)
  const scope = effectScope()
  scope.run(() => {
    for (let watcher = 0; watcher < dimensions.watchers; watcher++) {
      const key = (watcher % dimensions.items) + 1
      watchEffect(() => {
        void (runtime.cache.readItem({ collection, key }) as any)?.n
        runtime.counts.item++
      }, { flush: 'sync' })
    }
  })
  return finishMemoryScenario(runtime, scope, (index) => {
    const key = (index % dimensions.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index } })
  }, () => {
    invariant(stateCollectionSize(runtime, collection.name) === dimensions.items, 'item watcher cardinality drifted')
    invariant(runtime.counts.item >= dimensions.watchers, 'item watchers did not run')
  })
}

/** Build full-list reactive owners over seeded records. */
export function listWatchers(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items, 'all')
  const scope = effectScope()
  scope.run(() => mountListWatchers(runtime.cache, collection, dimensions.watchers, runtime.counts))
  return finishMemoryScenario(runtime, scope, (index) => {
    const key = (index % dimensions.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index }, marker: 'all' })
  }, () => {
    invariant(runtime.cache.readItems({ collection, marker: 'all' }).length === dimensions.items, 'list watcher cardinality drifted')
    invariant(runtime.counts.list >= dimensions.watchers, 'list watchers did not run')
  })
}

/** Churn short-lived missing-item owners across distinct keys. */
export function orphanSignalChurn(implementation: CacheImplementation, _dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  return finishMemoryScenario(runtime, undefined, (index) => {
    const scope = effectScope()
    scope.run(() => watchEffect(() => {
      void (runtime.cache.readItem({ collection, key: `missing-${index}` }) as any)?.id
    }, { flush: 'sync' }))
    scope.stop()
    invariant(!scope.active, 'orphan-signal scope remained active')
  }, () => invariant(stateCollectionSize(runtime, collection.name) === 0, 'orphan-signal churn created records'))
}
