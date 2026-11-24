import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { effectScope, watchEffect } from 'vue'
import { createScenarioRuntime, finishScenario, invariant, VENUE_SCHEMA } from './scenario-harness'

const TARGET_CITY = 'target'
const TARGET_ROOM = 'A'
const TARGET_INDEX_VALUE = `${TARGET_CITY}:${TARGET_ROOM}`

/** Build reads from an unambiguous composite-index bucket containing ten percent of rows. */
export function compositeIndexRead(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, VENUE_SCHEMA)
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  const bucketSize = Math.max(1, Math.floor(options.items / 10))
  seedEvents(runtime, options.items, bucketSize)
  let checksum = 0
  let lastLength = 0
  return finishScenario(runtime, undefined, options.items, () => {
    lastLength = runtime.cache.readItems({
      collection: event,
      indexKey: 'city:room',
      indexValue: TARGET_INDEX_VALUE,
    }).length
    checksum += lastLength
  }, () => {
    const bucket = runtime.cache.readItems({
      collection: event,
      indexKey: 'city:room',
      indexValue: TARGET_INDEX_VALUE,
    }) as any[]
    const keys = new Set(bucket.map(item => item.id))
    invariant(lastLength === bucketSize, `composite bucket contained ${lastLength} items, expected ${bucketSize}`)
    invariant(Array.from({ length: bucketSize }, (_, index) => index + 1).every(key => keys.has(key)), 'composite index read returned unexpected keys')
    invariant(checksum > 0, 'composite index reads were not consumed')
  })
}

/** Build writes that move one row into and out of a watched composite relation bucket. */
export function compositeIndexMembershipWrite(implementation: CacheImplementation, options: ScenarioOptions): Scenario {
  const runtime = createScenarioRuntime(implementation, VENUE_SCHEMA)
  const venue = runtime.collections.find(collection => collection.name === 'Venue')!
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  runtime.cache.writeItem({ collection: venue, key: 1, item: { id: 1, city: TARGET_CITY, room: TARGET_ROOM } })
  seedEvents(runtime, options.items, 1)
  const scope = effectScope()
  scope.run(() => {
    watchEffect(() => {
      void (runtime.cache.readItem({ collection: venue, key: 1 }) as any)?.events?.length
      runtime.counts.relation++
    }, { flush: 'sync' })
  })
  let expectedBucketSize = 1
  return finishScenario(runtime, scope, options.items, (index) => {
    const inTarget = index % 2 === 1
    expectedBucketSize = inTarget ? 1 : 0
    runtime.cache.writeItem({
      collection: event,
      key: 1,
      item: { id: 1, city: inTarget ? TARGET_CITY : 'other', room: inTarget ? TARGET_ROOM : 'B' },
    })
  }, () => {
    const bucket = runtime.cache.readItems({
      collection: event,
      indexKey: 'city:room',
      indexValue: TARGET_INDEX_VALUE,
    })
    invariant(bucket.length === expectedBucketSize, `composite membership was ${bucket.length}, expected ${expectedBucketSize}`)
    invariant(bucket.every(item => (item as any).id === 1), 'composite membership returned an unexpected key')
    invariant(runtime.cache.readItems({ collection: event }).length === options.items, 'composite membership writes changed cardinality')
    invariant(runtime.counts.relation > 0, 'composite membership writes did not rerun relation reader')
  })
}

/** Seed deterministic rows across one target and one alternate composite bucket. */
function seedEvents(runtime: ReturnType<typeof createScenarioRuntime>, count: number, targetCount: number): void {
  const event = runtime.collections.find(collection => collection.name === 'Event')!
  runtime.cache.writeItems({
    collection: event,
    items: Array.from({ length: count }, (_, index) => {
      const key = index + 1
      const target = key <= targetCount
      return {
        key,
        value: { id: key, city: target ? TARGET_CITY : 'other', room: target ? TARGET_ROOM : 'B', n: 0 },
      }
    }),
  })
}
