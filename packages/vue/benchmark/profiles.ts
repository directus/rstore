import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { compositeIndexMembershipWrite, compositeIndexRead } from './index-scenarios'
import { filteredLimitedListRead, fullListRead, indexedListRead, itemRead } from './read-scenarios'
import { fieldWriteUnderItems, fieldWriteUnderLists, fieldWriteWithListRead, listReadUnderLayer, relationRelatedFieldWrites, relationUnrelatedWrites, replaceUnderLists } from './scenarios'
import { batchWrite, hydrateState, layerCycle, pausedWriteBatch, relationMembershipWrite, serializeState } from './state-scenarios'
import { crdtFreshWrite, crdtStaleWrite, nestedRelationWrite } from './write-scenarios'

/** A workload that both cache implementations support. */
export interface BenchmarkScenario {
  /** Stable identifier for report consumers. */
  id: string
  /** Human-readable workload label. */
  name: string
  /** Construct isolated cache state for one implementation. */
  build: (implementation: CacheImplementation, options: ScenarioOptions) => Scenario
  /** Reactive reader shape, when this workload mounts one. */
  observer?: 'list' | 'item' | 'relation'
  /** Item counts overriding the containing profile's size matrix. */
  itemCounts?: readonly number[]
}

/** Benchmark duration and workload selection. */
export interface BenchmarkProfile {
  /** Human-readable command profile. */
  name: 'quick' | 'full'
  /** Item counts to exercise. */
  itemCounts: readonly number[]
  /** Live watcher count for reactive workloads. */
  watchers: number
  /** Tinybench measured duration per implementation in milliseconds. */
  time: number
  /** Tinybench warmup duration per implementation in milliseconds. */
  warmupTime: number
  /** Minimum task samples. */
  iterations: number
  /** Target elapsed duration for one calibrated batch. */
  batchTargetMs: number
  /** RME threshold before one longer retry. */
  maxRme: number
  /** Workloads selected by this profile. */
  scenarios: readonly BenchmarkScenario[]
}

/** Optional workload dimensions and report metadata. */
interface WorkloadOptions {
  /** Reactive reader shape, when present. */
  observer?: BenchmarkScenario['observer']
  /** Focused item counts for workloads whose cost does not scale with collection size. */
  itemCounts?: BenchmarkScenario['itemCounts']
}

const REACTIVE_SCENARIOS: readonly BenchmarkScenario[] = [
  workload('field-write-list-watchers', 'field write / list watchers', fieldWriteUnderLists, { observer: 'list' }),
  workload('field-write-item-watchers', 'field write / item watchers', fieldWriteUnderItems, { observer: 'item' }),
  workload('field-write-list-read', 'field write + imperative list read', fieldWriteWithListRead),
  workload('replace-list-watchers', 'replace / list watchers', replaceUnderLists, { observer: 'list' }),
  workload('layer-field-read', 'read fields / 5 optimistic layers', listReadUnderLayer),
  workload('relation-unrelated-write', 'relation read / unrelated writes', relationUnrelatedWrites, { observer: 'relation' }),
]

const FULL_ONLY_SCENARIOS: readonly BenchmarkScenario[] = [
  workload('item-read', 'read item', itemRead),
  workload('list-read', 'read full list', fullListRead),
  workload('filtered-list-read', 'read filtered limited list', filteredLimitedListRead),
  workload('indexed-list-read', 'read indexed list', indexedListRead),
  workload('batch-write', 'write 100-item batch', batchWrite),
  workload('paused-write-batch', 'pause / 20 writes / resume', pausedWriteBatch),
  workload('relation-membership-write', 'relation membership write', relationMembershipWrite, { observer: 'relation' }),
  workload('relation-related-field-write', 'relation read / related field writes', relationRelatedFieldWrites, { observer: 'relation', itemCounts: [1000] }),
  workload('composite-index-read', 'read composite index', compositeIndexRead),
  workload('composite-index-membership-write', 'composite index membership write', compositeIndexMembershipWrite, { observer: 'relation', itemCounts: [1000] }),
  workload('crdt-fresh-write', 'accepted CRDT field write', crdtFreshWrite, { itemCounts: [1000] }),
  workload('crdt-stale-write', 'rejected stale CRDT field write', crdtStaleWrite, { itemCounts: [1000] }),
  workload('nested-relation-write', 'write parent + 10 nested children', nestedRelationWrite, { itemCounts: [1000] }),
  workload('layer-cycle', 'optimistic layer cycle', layerCycle),
  workload('serialize-state', 'serialize cache state', serializeState),
  workload('hydrate-state', 'hydrate cache state', hydrateState),
]

/** Fast local comparison profile. */
export const QUICK_PROFILE: BenchmarkProfile = {
  name: 'quick',
  itemCounts: [1000],
  watchers: 20,
  time: 500,
  warmupTime: 100,
  iterations: 10,
  batchTargetMs: 2,
  maxRme: 5,
  scenarios: REACTIVE_SCENARIOS,
}

/** Broad size matrix for deliberate performance investigation. */
export const FULL_PROFILE: BenchmarkProfile = {
  name: 'full',
  itemCounts: [100, 1000, 10_000],
  watchers: 20,
  time: 1000,
  warmupTime: 200,
  iterations: 20,
  batchTargetMs: 5,
  maxRme: 3,
  scenarios: [...REACTIVE_SCENARIOS, ...FULL_ONLY_SCENARIOS],
}

/** Attach a stable label to a scenario builder. */
function workload(
  id: string,
  name: string,
  build: BenchmarkScenario['build'],
  options: WorkloadOptions = {},
): BenchmarkScenario {
  return { id, name, build, ...options }
}
