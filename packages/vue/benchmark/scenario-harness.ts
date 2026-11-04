import type { Cache, ResolvedCollection } from '@rstore/shared'
import type { EffectScope } from 'vue'
import type { CacheImplementation, CacheRuntimeHarness } from './runtime'
import { watchEffect } from 'vue'
import { createCacheRuntime } from './runtime'

export type { CacheFactory, CacheImplementation } from './runtime'

/** Reactive rerun counters captured outside timed assertions. */
export interface ScenarioCounts {
  /** Full-list watcher reruns. */
  list: number
  /** Item watcher reruns. */
  item: number
  /** Relation watcher reruns. */
  relation: number
}

/** Fixed-cardinality benchmark scenario. */
export interface Scenario {
  /** Apply one cyclic operation. */
  operation: (index: number) => void
  /** Reset operation and rerun counters after warmup. */
  resetMeasurements: () => void
  /** Validate operation count, final state, and rerun invariants. */
  validate: (expectedOperations?: number) => void
  /** Read current rerun counters. */
  counts: () => ScenarioCounts
  /** Stop scopes and cache timers, then validate disposal. */
  teardown: () => void
}

/** Common scenario configuration. */
export interface ScenarioOptions {
  /** Seeded collection size. */
  items: number
  /** Number of live reactive readers. */
  watchers: number
}

/** Mutable scenario runtime shared by builders. */
export interface ScenarioRuntime extends CacheRuntimeHarness {
  /** Mutable rerun counters. */
  counts: ScenarioCounts
  /** Number of workload operations. */
  operations: number
}

/** Small collection used by item and list workloads. */
export const TODO_SCHEMA = [{ name: 'Todo' }]

/** Single-field relation schema used by relation workloads. */
export const BLOG_SCHEMA = [
  { name: 'Post', relations: { comments: { many: true, to: { Comment: { on: { postId: 'id' } } } } } },
  { name: 'Comment' },
]

/** Two-field relation schema used by composite-index workloads. */
export const VENUE_SCHEMA = [
  { name: 'Venue', relations: { events: { many: true, to: { Event: { on: { city: 'city', room: 'room' } } } } } },
  { name: 'Event' },
]

/** Create scenario counters around the shared synthetic cache runtime. */
export function createScenarioRuntime(implementation: CacheImplementation, schema: any[]): ScenarioRuntime {
  return { ...createCacheRuntime(implementation, schema), counts: createCounts(), operations: 0 }
}

/** Seed equivalent deterministic input in one batch. */
export function seedScenarioItems(cache: Cache, collection: ResolvedCollection<any, any, any>, count: number, marker?: string): void {
  cache.writeItems({
    collection,
    marker,
    items: Array.from({ length: count }, (_, index) => {
      const key = index + 1
      return { key, value: { id: key, label: `item-${key}`, n: 0 } }
    }),
  })
}

/** Mount synchronous list-length watchers. */
export function mountListWatchers(
  cache: Cache,
  collection: ResolvedCollection<any, any, any>,
  count: number,
  counts: ScenarioCounts,
): void {
  for (let watcher = 0; watcher < count; watcher++) {
    watchEffect(() => {
      void cache.readItems({ collection, marker: 'all' }).length
      counts.list++
    }, { flush: 'sync' })
  }
}

/** Add common measurement, validation, and teardown behavior. */
export function finishScenario(
  runtime: ScenarioRuntime,
  scope: EffectScope | undefined,
  expectedItems: number,
  operation: (index: number) => void,
  validateExtra: () => void = () => {},
): Scenario {
  let tornDown = false
  return {
    operation(index) {
      operation(index)
      runtime.operations++
    },
    resetMeasurements() {
      runtime.operations = 0
      Object.assign(runtime.counts, createCounts())
    },
    validate(expectedOperations) {
      if (expectedOperations != null) {
        invariant(runtime.operations === expectedOperations, `expected ${expectedOperations} operations, received ${runtime.operations}`)
      }
      else {
        invariant(runtime.operations > 0, 'throughput benchmark ran zero operations')
      }
      invariant(expectedItems > 0, 'scenario requires seeded items')
      validateExtra()
    },
    counts: () => ({ ...runtime.counts }),
    teardown() {
      if (tornDown) {
        return
      }
      tornDown = true
      scope?.stop()
      invariant(!scope?.active, 'effect scope remained active after stop')
      runtime.cache.dispose()
    },
  }
}

/** Throw a compact benchmark validation error. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Benchmark invariant failed: ${message}`)
  }
}

/** Create zeroed rerun counters. */
function createCounts(): ScenarioCounts {
  return { list: 0, item: 0, relation: 0 }
}
