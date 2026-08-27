import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions, ScenarioRuntime } from './scenario-harness'
import { effectScope, watchEffect } from 'vue'
import { BLOG_SCHEMA, createScenarioRuntime, finishScenario, invariant, VENUE_SCHEMA } from './scenario-harness'

const TARGET_CITY = 'target'
const TARGET_ROOM = 'A'

/** Build unwatched composite membership writes to isolate index reconciliation. */
export function compositeWriteWithoutWatcher(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createCompositeRuntime(implementation, options)
  return finishMembershipScenario(runtime, options, undefined)
}

/** Build composite writes with one direct exact-index reader. */
export function compositeWriteWithDirectWatcher(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createCompositeRuntime(implementation, options)
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  const scope = effectScope()
  scope.run(() => watchEffect(() => {
    void runtime.cache.readItems({
      collection: event,
      indexKey: 'city:room',
      indexValue: [TARGET_CITY, TARGET_ROOM],
    }).length
    runtime.counts.relation++
  }, { flush: 'sync' }))
  return finishMembershipScenario(runtime, options, scope)
}

/** Build scalar membership writes with one direct exact-index reader. */
export function scalarWriteWithDirectWatcher(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, BLOG_SCHEMA)
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  seedComments(runtime, options.items)
  const scope = effectScope()
  scope.run(() => watchEffect(() => {
    void runtime.cache.readItems({ collection: comment, indexKey: 'postId', indexValue: '1' }).length
    runtime.counts.relation++
  }, { flush: 'sync' }))
  let expected = 1
  return finishScenario(runtime, scope, options.items, (index) => {
    expected = index % 2 === 1 ? 1 : 0
    runtime.cache.writeItem({ collection: comment, key: 1, item: { id: 1, postId: expected ? 1 : 2 } })
  }, () => validateMembership(runtime, comment, 'postId', '1', expected, options.items))
}

/** Create deterministic composite-index data. */
function createCompositeRuntime(implementation: CacheImplementation, options: ScenarioOptions): ScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, VENUE_SCHEMA)
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  runtime.cache.writeItems({
    collection: event,
    items: Array.from({ length: options.items }, (_, index) => {
      const id = index + 1
      return { key: id, value: { id, city: id === 1 ? TARGET_CITY : 'other', room: id === 1 ? TARGET_ROOM : 'B' } }
    }),
  })
  return runtime
}

/** Finish alternating composite membership writes with shared validation. */
function finishMembershipScenario(
  runtime: ScenarioRuntime,
  options: ScenarioOptions,
  scope: ReturnType<typeof effectScope> | undefined,
): Scenario {
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  let expected = 1
  return finishScenario(runtime, scope, options.items, (index) => {
    expected = index % 2 === 1 ? 1 : 0
    runtime.cache.writeItem({
      collection: event,
      key: 1,
      item: { id: 1, city: expected ? TARGET_CITY : 'other', room: expected ? TARGET_ROOM : 'B' },
    })
  }, () => validateMembership(runtime, event, 'city:room', `${TARGET_CITY}:${TARGET_ROOM}`, expected, options.items))
}

/** Seed one target scalar membership and stable alternate rows. */
function seedComments(runtime: ScenarioRuntime, count: number): void {
  const comment = runtime.collections.find(collection => collection.name === 'Comment')!
  runtime.cache.writeItems({
    collection: comment,
    items: Array.from({ length: count }, (_, index) => {
      const id = index + 1
      return { key: id, value: { id, postId: id === 1 ? 1 : 2 } }
    }),
  })
}

/** Validate membership and cardinality outside timed regions. */
function validateMembership(
  runtime: ScenarioRuntime,
  collection: ScenarioRuntime['collections'][number],
  indexKey: string,
  indexValue: string | number | Array<string | number>,
  expected: number,
  total: number,
): void {
  const bucket = runtime.cache.readItems({ collection, indexKey, indexValue })
  invariant(bucket.length === expected, `membership was ${bucket.length}, expected ${expected}`)
  invariant(runtime.cache.readItems({ collection }).length === total, 'membership write changed cardinality')
}
