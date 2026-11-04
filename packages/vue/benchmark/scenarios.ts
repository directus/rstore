import type { CacheLayer } from '@rstore/shared'
import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { effectScope, watchEffect } from 'vue'
import { BLOG_SCHEMA, createScenarioRuntime, finishScenario, invariant, mountListWatchers, seedScenarioItems, TODO_SCHEMA } from './scenario-harness'

export type { CacheFactory, CacheImplementation } from './runtime'
export type { Scenario, ScenarioCounts, ScenarioOptions } from './scenario-harness'

/** Build field writes with live full-list readers. */
export function fieldWriteUnderLists(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  const scope = effectScope()
  scope.run(() => mountListWatchers(runtime.cache, collection, options.watchers, runtime.counts))
  return finishScenario(runtime, scope, options.items, (index) => {
    const key = (index % options.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index } })
  }, () => {
    invariant(runtime.cache.readItems({ collection, marker: 'all' }).length === options.items, 'field write changed cardinality')
    if (implementation.name === 'engine') {
      invariant(runtime.counts.list === 0, 'engine field write reran list watchers')
    }
  })
}

/** Build field writes with live single-item readers. */
export function fieldWriteUnderItems(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items)
  const scope = effectScope()
  scope.run(() => {
    for (let watcher = 0; watcher < options.watchers; watcher++) {
      const key = (watcher % options.items) + 1
      watchEffect(() => {
        void (runtime.cache.readItem({ collection, key }) as any)?.n
        runtime.counts.item++
      }, { flush: 'sync' })
    }
  })
  return finishScenario(runtime, scope, options.items, (index) => {
    const key = (index % options.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index } })
  }, () => {
    invariant(runtime.cache.readItems({ collection }).length === options.items, 'item write changed cardinality')
  })
}

/** Build field writes followed by imperative full-list reads. */
export function fieldWriteWithListRead(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items)
  const initial = runtime.cache.readItems({ collection })
  let lastLength = initial.length
  let wrappersStable = true
  return finishScenario(runtime, undefined, options.items, (index) => {
    const key = (index % options.items) + 1
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index } })
    const current = runtime.cache.readItems({ collection })
    lastLength = current.length
    wrappersStable &&= current[0] === initial[0]
  }, () => {
    invariant(lastLength === options.items, 'imperative list read changed cardinality')
    invariant(wrappersStable, 'field write replaced cached list wrappers')
  })
}

/** Build fixed-cardinality delete-plus-insert membership changes. */
export function replaceUnderLists(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  const scope = effectScope()
  scope.run(() => mountListWatchers(runtime.cache, collection, options.watchers, runtime.counts))
  return finishScenario(runtime, scope, options.items, (index) => {
    const key = (index % options.items) + 1
    runtime.cache.deleteItem({ collection, key })
    runtime.cache.writeItem({ collection, key, item: { id: key, n: index }, marker: 'all' })
  }, () => {
    invariant(runtime.cache.readItems({ collection, marker: 'all' }).length === options.items, 'replace changed cardinality')
  })
}

/** Build repeated field reads through five overlapping optimistic layers. */
export function listReadUnderLayer(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items, 'all')
  const layerCount = 5
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    const state: Record<number, any> = {}
    for (let key = 1; key <= options.items; key += 10) {
      state[key] = { n: layerIndex + 1 }
    }
    const layer: CacheLayer = {
      id: `opt-${layerIndex}`,
      collectionName: collection.name,
      state,
      deletedItems: new Set(),
      optimistic: true,
    }
    runtime.cache.addLayer(layer)
  }
  const expectedSum = Math.ceil(options.items / 10) * layerCount
  let checksum = 0
  let lastSum = 0
  return finishScenario(runtime, undefined, options.items, () => {
    const items = runtime.cache.readItems({ collection, marker: 'all' }) as any[]
    lastSum = items.reduce((sum, item) => sum + Number(item.n ?? 0), 0)
    checksum += lastSum
  }, () => {
    invariant(runtime.cache.readItems({ collection, marker: 'all' }).length === options.items, 'layer read changed cardinality')
    invariant(lastSum === expectedSum, `layer field checksum was ${lastSum}, expected ${expectedSum}`)
    invariant(checksum > 0, 'layer fields were not consumed')
  })
}

/** Build relation reads while cyclically updating unrelated existing rows. */
export function relationUnrelatedWrites(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const post = runtime.collections.find(collection => collection.name === 'Post')!
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  runtime.cache.writeItem({ collection: post, key: 1, item: { id: 1 } })
  const relatedCount = Math.min(10, Math.max(0, options.items - 1))
  for (let key = 1; key <= options.items; key++) {
    runtime.cache.writeItem({ collection: comment, key, item: { id: key, postId: key <= relatedCount ? 1 : 2, n: 0 } })
  }
  const unrelatedCount = options.items - relatedCount
  const scope = effectScope()
  scope.run(() => {
    watchEffect(() => {
      void (runtime.cache.readItem({ collection: post, key: 1 }) as any)?.comments?.length
      runtime.counts.relation++
    }, { flush: 'sync' })
  })
  return finishScenario(runtime, scope, options.items, (index) => {
    const key = relatedCount + (index % unrelatedCount) + 1
    runtime.cache.writeItem({ collection: comment, key, item: { id: key, postId: 2, n: index } })
  }, () => {
    invariant(runtime.cache.readItems({ collection: comment }).length === options.items, 'relation writes changed cardinality')
    invariant((runtime.cache.readItem({ collection: post, key: 1 }) as any)?.comments.length === relatedCount, 'relation membership changed')
    if (implementation.name === 'engine') {
      invariant(runtime.counts.relation === 0, 'unrelated engine write reran relation reader')
    }
  })
}

/** Build relation reads while updating fields inside the observed bucket. */
export function relationRelatedFieldWrites(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const post = runtime.collections.find(collection => collection.name === 'Post')!
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  const relatedCount = Math.min(10, options.items)
  runtime.cache.writeItem({ collection: post, key: 1, item: { id: 1 } })
  for (let key = 1; key <= options.items; key++) {
    runtime.cache.writeItem({ collection: comment, key, item: { id: key, postId: key <= relatedCount ? 1 : 2, n: 0 } })
  }
  const scope = effectScope()
  scope.run(() => {
    watchEffect(() => {
      void (runtime.cache.readItem({ collection: post, key: 1 }) as any)?.comments?.length
      runtime.counts.relation++
    }, { flush: 'sync' })
  })
  return finishScenario(runtime, scope, options.items, (index) => {
    const key = (index % relatedCount) + 1
    runtime.cache.writeItem({ collection: comment, key, item: { id: key, postId: 1, n: index + 1 } })
  }, () => {
    invariant(runtime.cache.readItems({ collection: comment }).length === options.items, 'related field writes changed cardinality')
    invariant((runtime.cache.readItem({ collection: post, key: 1 }) as any)?.comments.length === relatedCount, 'related field writes changed membership')
    if (implementation.name === 'engine') {
      invariant(runtime.counts.relation === 0, 'related engine field write reran relation reader')
    }
  })
}
