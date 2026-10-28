import type { CacheLayer } from '@rstore/shared'
import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { effectScope, watchEffect } from 'vue'
import { BLOG_SCHEMA, createScenarioRuntime, finishScenario, invariant, seedScenarioItems, TODO_SCHEMA } from './scenario-harness'

/** Build cyclic updates through one public writeItems batch. */
export function batchWrite(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  const batchSize = Math.min(100, options.items)
  return finishScenario(runtime, undefined, options.items, (index) => {
    runtime.cache.writeItems({
      collection,
      items: Array.from({ length: batchSize }, (_, offset) => {
        const key = ((index * batchSize + offset) % options.items) + 1
        return { key, value: { id: key, n: index } }
      }),
    })
  })
}

/** Build one queued write batch bounded by pause/resume. */
export function pausedWriteBatch(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  const batchSize = Math.min(20, options.items)
  return finishScenario(runtime, undefined, options.items, (index) => {
    runtime.cache.pause()
    for (let offset = 0; offset < batchSize; offset++) {
      const key = ((index * batchSize + offset) % options.items) + 1
      runtime.cache.writeItem({ collection, key, item: { id: key, n: index } })
    }
    runtime.cache.resume()
  })
}

/** Build updates that repeatedly change a watched relation's membership. */
export function relationMembershipWrite(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const post = runtime.collections.find(collection => collection.name === 'Post')!
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  runtime.cache.writeItem({ collection: post, key: 1, item: { id: 1 } })
  for (let key = 1; key <= options.items; key++) {
    runtime.cache.writeItem({ collection: comment, key, item: { id: key, postId: key === 1 ? 1 : 2 } })
  }
  const scope = effectScope()
  scope.run(() => {
    watchEffect(() => {
      void (runtime.cache.readItem({ collection: post, key: 1 }) as any)?.comments.length
      runtime.counts.relation++
    }, { flush: 'sync' })
  })
  return finishScenario(runtime, scope, options.items, (index) => {
    runtime.cache.writeItem({ collection: comment, key: 1, item: { id: 1, postId: index % 2 === 0 ? 2 : 1 } })
  }, () => {
    invariant(runtime.counts.relation > 0, 'relation membership writes did not rerun reader')
  })
}

/** Build add/read/remove cycles for one optimistic layer. */
export function layerCycle(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  let checksum = 0
  return finishScenario(runtime, undefined, options.items, (index) => {
    const layer: CacheLayer = {
      id: 'benchmark-layer',
      collectionName: collection.name,
      state: { 1: { n: index } },
      deletedItems: new Set(),
      optimistic: true,
    }
    runtime.cache.addLayer(layer)
    checksum += Number((runtime.cache.readItem({ collection, key: 1 }) as any)?.n ?? 0)
    runtime.cache.removeLayer(layer.id)
  }, () => {
    invariant(checksum > 0, 'layer reads were not consumed')
    invariant(runtime.cache.getLayer('benchmark-layer') == null, 'layer remained after cycle')
  })
}

/** Build serialization of a populated cache snapshot. */
export function serializeState(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  let checksum = 0
  return finishScenario(runtime, undefined, options.items, () => {
    checksum += Object.keys(runtime.cache.getState().collections.Todo ?? {}).length
  }, () => {
    invariant(checksum > 0, 'snapshots were not consumed')
  })
}

/** Build hydration of one equivalent prebuilt snapshot. */
export function hydrateState(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  const state = runtime.cache.getState()
  return finishScenario(runtime, undefined, options.items, () => {
    runtime.cache.setState(state)
  })
}
