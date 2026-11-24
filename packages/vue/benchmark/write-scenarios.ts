import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { BLOG_SCHEMA, createScenarioRuntime, finishScenario, invariant, seedScenarioItems, TODO_SCHEMA } from './scenario-harness'

/** Build accepted CRDT field updates with monotonically increasing timestamps. */
export function crdtFreshWrite(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items)
  const timestamps = Array.from({ length: options.items + 1 }, () => 0)
  for (let key = 1; key <= options.items; key++) {
    runtime.cache.writeFieldTimestamps({ collectionName: collection.name, key, timestamps: { n: 0 } })
  }
  let lastKey = 1
  let lastValue = 0
  return finishScenario(runtime, undefined, options.items, (index) => {
    lastKey = (index % options.items) + 1
    lastValue = ++timestamps[lastKey]!
    runtime.cache.writeItem({
      collection,
      key: lastKey,
      item: { id: lastKey, n: lastValue },
      fieldTimestamps: { n: lastValue },
    })
  }, () => {
    invariant((runtime.cache.readItem({ collection, key: lastKey }) as any)?.n === lastValue, 'fresh CRDT write was not accepted')
    invariant(runtime.cache.readItems({ collection }).length === options.items, 'fresh CRDT writes changed cardinality')
  })
}

/** Build CRDT field updates rejected by newer stored timestamps. */
export function crdtStaleWrite(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, options.items)
  const storedTimestamp = 1_000_000_000
  for (let key = 1; key <= options.items; key++) {
    runtime.cache.writeItem({ collection, key, item: { id: key, n: 7 }, fieldTimestamps: { n: storedTimestamp } })
  }
  let lastKey = 1
  return finishScenario(runtime, undefined, options.items, (index) => {
    lastKey = (index % options.items) + 1
    runtime.cache.writeItem({
      collection,
      key: lastKey,
      item: { id: lastKey, n: -(index + 1) },
      fieldTimestamps: { n: index + 1 },
    })
  }, () => {
    invariant((runtime.cache.readItem({ collection, key: lastKey }) as any)?.n === 7, 'stale CRDT write replaced newer state')
    invariant(runtime.cache.readItems({ collection }).length === options.items, 'stale CRDT writes changed cardinality')
  })
}

/** Build parent writes that update ten existing nested relation items. */
export function nestedRelationWrite(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const post = runtime.collections.find(collection => collection.name === 'Post')!
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  seedScenarioItems(runtime.cache, comment, options.items)
  runtime.cache.writeItem({ collection: post, key: 1, item: { id: 1, title: 'seed' } })
  const childCount = Math.min(10, options.items)
  let lastValue = 0
  return finishScenario(runtime, undefined, options.items, (index) => {
    lastValue = index + 1
    runtime.cache.writeItem({
      collection: post,
      key: 1,
      item: {
        id: 1,
        title: `post-${lastValue}`,
        comments: Array.from({ length: childCount }, (_, offset) => ({
          id: offset + 1,
          postId: 1,
          n: lastValue,
        })),
      },
    })
  }, () => {
    invariant(runtime.cache.readItems({ collection: post }).length === 1, 'nested writes changed parent cardinality')
    invariant(runtime.cache.readItems({ collection: comment }).length === options.items, 'nested writes changed child cardinality')
    invariant((runtime.cache.readItem({ collection: comment, key: childCount }) as any)?.n === lastValue, 'nested child write was not applied')
  })
}
