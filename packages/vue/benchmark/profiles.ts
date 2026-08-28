import type { CacheImplementation } from './runtime'
import type { Scenario, ScenarioOptions } from './scenario-harness'
import { compositeWriteWithDirectWatcher, compositeWriteWithLegacyWatcher, compositeWriteWithoutWatcher, scalarWriteWithDirectWatcher } from './decomposition-scenarios'
import { compositeIndexMembershipWrite, compositeIndexRead } from './index-scenarios'
import { filteredLimitedListRead, fullListRead, indexedListRead, itemRead } from './read-scenarios'
import { fieldWriteUnderItems, fieldWriteUnderLists, fieldWriteWithListRead, listReadUnderLayer, relationRelatedFieldWrites, relationUnrelatedWrites, replaceUnderLists } from './scenarios'
import { batchWrite, hydrateState, layerCycle, pausedWriteBatch, relationMembershipWrite, serializeState } from './state-scenarios'
import { crdtStaleWriteWithItemInterest, fieldWriteWithExactItemInterest, fieldWriteWithoutConsumer, hydrateWithRetainedWrapper } from './write-decomposition-scenarios'
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
  name: 'quick' | 'full' | 'decomposition' | 'write-decomposition'
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
  /** RME threshold before longer bounded retries. */
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

const REGRESSION_SCENARIOS: readonly BenchmarkScenario[] = [
  workload('item-read', 'read item', itemRead),
  workload('composite-index-membership-write', 'composite index membership write', compositeIndexMembershipWrite, { observer: 'relation', itemCounts: [1000] }),
]

const FULL_ONLY_SCENARIOS: readonly BenchmarkScenario[] = [
  workload('list-read', 'read full list', fullListRead),
  workload('filtered-list-read', 'read filtered limited list', filteredLimitedListRead),
  workload('indexed-list-read', 'read indexed list', indexedListRead),
  workload('batch-write', 'write 100-item batch', batchWrite),
  workload('paused-write-batch', 'pause / 20 writes / resume', pausedWriteBatch),
  workload('relation-membership-write', 'relation membership write', relationMembershipWrite, { observer: 'relation' }),
  workload('relation-related-field-write', 'relation read / related field writes', relationRelatedFieldWrites, { observer: 'relation', itemCounts: [1000] }),
  workload('composite-index-read', 'read composite index', compositeIndexRead),
  workload('crdt-fresh-write', 'accepted CRDT field write', crdtFreshWrite, { itemCounts: [1000] }),
  workload('crdt-stale-write', 'rejected stale CRDT field write', crdtStaleWrite, { itemCounts: [1000] }),
  workload('nested-relation-write', 'write parent + 10 nested children', nestedRelationWrite, { itemCounts: [1000] }),
  workload('layer-cycle', 'optimistic layer cycle', layerCycle),
  workload('serialize-state', 'serialize cache state', serializeState),
  workload('hydrate-state', 'hydrate cache state', hydrateState),
  workload('composite-write-no-watcher', 'composite membership write / no watcher', compositeWriteWithoutWatcher, { itemCounts: [1000] }),
  workload('composite-write-direct-watcher', 'composite membership write / direct watcher', compositeWriteWithDirectWatcher, { observer: 'relation', itemCounts: [1000] }),
  workload('scalar-write-direct-watcher', 'scalar membership write / direct watcher', scalarWriteWithDirectWatcher, { observer: 'relation', itemCounts: [1000] }),
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
  scenarios: [...REACTIVE_SCENARIOS, ...REGRESSION_SCENARIOS],
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
  scenarios: [...REACTIVE_SCENARIOS, ...REGRESSION_SCENARIOS, ...FULL_ONLY_SCENARIOS],
}

/** Focused index-writer decomposition for local profiling. */
export const DECOMPOSITION_PROFILE: BenchmarkProfile = {
  ...QUICK_PROFILE,
  name: 'decomposition',
  scenarios: [
    REGRESSION_SCENARIOS[1]!,
    ...FULL_ONLY_SCENARIOS.slice(-3),
  ],
}

/** Focused demand-driven write-path decomposition for local profiling. */
export const WRITE_DECOMPOSITION_PROFILE: BenchmarkProfile = {
  ...QUICK_PROFILE,
  name: 'write-decomposition',
  scenarios: [
    workload('field-write-no-consumer', 'field write / no consumer', fieldWriteWithoutConsumer, { itemCounts: [1000] }),
    REACTIVE_SCENARIOS[0]!,
    workload('field-write-exact-item', 'field write / exact item consumer', fieldWriteWithExactItemInterest, { observer: 'item', itemCounts: [1000] }),
    FULL_ONLY_SCENARIOS[3]!,
    FULL_ONLY_SCENARIOS[4]!,
    FULL_ONLY_SCENARIOS[8]!,
    FULL_ONLY_SCENARIOS[9]!,
    workload('crdt-stale-write-item-interest', 'rejected stale CRDT write / item consumer', crdtStaleWriteWithItemInterest, { observer: 'item', itemCounts: [1000] }),
    FULL_ONLY_SCENARIOS[11]!,
    FULL_ONLY_SCENARIOS[12]!,
    FULL_ONLY_SCENARIOS[13]!,
    workload('hydrate-retained-wrapper', 'hydrate / retained wrapper', hydrateWithRetainedWrapper, { observer: 'item', itemCounts: [1000] }),
    ...FULL_ONLY_SCENARIOS.slice(-3),
    workload('composite-write-legacy-watcher', 'composite membership write / legacy watcher', compositeWriteWithLegacyWatcher, { observer: 'relation', itemCounts: [1000] }),
    REGRESSION_SCENARIOS[1]!,
  ],
}

/** Focused public list/index read matrix for regression investigation. */
export const READ_REGRESSION_PROFILE: BenchmarkProfile = {
  ...FULL_PROFILE,
  name: 'decomposition',
  scenarios: [
    ...FULL_ONLY_SCENARIOS.slice(0, 3),
    FULL_ONLY_SCENARIOS[7]!,
  ],
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
