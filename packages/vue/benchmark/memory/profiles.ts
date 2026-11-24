import type { MemoryProfile, MemoryProfileRow, MemoryScenarioDefinition } from './types'
import { createControlRuntime } from './scenario-runtime'
import { compositeIndexReader, indexResultChurn, relationReader, scalarIndexReader } from './scenarios/indexes'
import { hydrateRetainedWrapper, optimisticLayers } from './scenarios/lifecycle'
import { itemWatchers, listWatchers, orphanSignalChurn } from './scenarios/reactivity'
import { materializedWrappers, recordsOnly, tombstoneState, wrapperLifecycleChurn } from './scenarios/records'

const CONTROL = scenario('empty-control', 'empty lifecycle control', 'iterations', 10_000, 10_000, () => createControlRuntime())
const RECORDS = scenario('records-only', 'records only', 'writes', 10_000, 10_000, recordsOnly)
const WRAPPERS = scenario('materialized-wrappers', 'materialized wrappers', 'writes', 10_000, 10_000, materializedWrappers)
const ITEM_WATCHERS = scenario('item-watchers', 'exact-item watchers', 'writes', 10_000, 10_000, itemWatchers)
const LIST_WATCHERS = scenario('list-watchers', 'full-list watchers', 'writes', 128, 128, listWatchers)
const SCALAR_INDEX = scenario('scalar-index-reader', 'scalar index reader', 'membership changes', 1_000, 1_000, scalarIndexReader)
const COMPOSITE_INDEX = scenario('composite-index-reader', 'composite index reader', 'membership changes', 1_000, 1_000, compositeIndexReader)
const RELATION = scenario('relation-reader', 'relation reader', 'membership changes', 1_000, 1_000, relationReader)
const LAYERS = scenario('optimistic-layers', 'five optimistic layers', 'layer cycles', 1_000, 1_000, optimisticLayers)
const HYDRATE = scenario('hydrate-retained-wrapper', 'hydrate with retained wrapper', 'hydrations', 128, 128, hydrateRetainedWrapper)
const TOMBSTONES = scenario('tombstones', 'delete/reinsert tombstones', 'mutations', 2_000, 2_000, tombstoneState)
const INDEX_CHURN = scenario('index-result-churn', 'exact-index result churn', 'queries', 512, 512, indexResultChurn)
const ORPHAN_SIGNALS = scenario('orphan-signal-churn', 'orphan signal churn', 'scopes', 1_024, 1_024, orphanSignalChurn)
const WRAPPER_CHURN = scenario('wrapper-lifecycle-churn', 'wrapper lifecycle churn', 'lifecycles', 2_000, 2_000, wrapperLifecycleChurn)

/** Fast local retained-memory ownership profile. */
export const QUICK_MEMORY_PROFILE: MemoryProfile = {
  name: 'quick',
  rows: [
    row(CONTROL, 1_000),
    row(RECORDS, 1_000),
    row(WRAPPERS, 1_000),
    row(ITEM_WATCHERS, 1_000, 20),
    row(LIST_WATCHERS, 1_000, 20),
    row(SCALAR_INDEX, 1_000, 1),
    row(LAYERS, 1_000),
    row(HYDRATE, 1_000),
  ],
}

/** Broad retained-memory size and ownership profile. */
export const FULL_MEMORY_PROFILE: MemoryProfile = {
  name: 'full',
  rows: [
    row(CONTROL, 1_000),
    ...matrix([RECORDS, WRAPPERS, SCALAR_INDEX, COMPOSITE_INDEX, RELATION, LAYERS, TOMBSTONES]),
    row(ITEM_WATCHERS, 1_000, 20),
    row(LIST_WATCHERS, 1_000, 20),
    row(HYDRATE, 1_000),
    row(INDEX_CHURN, 4_096),
    row(ORPHAN_SIGNALS, 1_024),
    row(WRAPPER_CHURN, 1_000),
  ],
}

/** Find one stable scenario definition across full profile rows. */
export function findMemoryScenario(id: string): MemoryScenarioDefinition | undefined {
  return FULL_MEMORY_PROFILE.rows.find(row => row.scenario.id === id)?.scenario
}

/** Attach stable metadata to one memory scenario builder. */
function scenario(
  id: string,
  name: string,
  unit: string,
  warmupUnits: number,
  growthUnits: number,
  build: MemoryScenarioDefinition['build'],
): MemoryScenarioDefinition {
  return { id, name, unit, warmupUnits, growthUnits, build }
}

/** Create one concrete profile row. */
function row(scenario: MemoryScenarioDefinition, items: number, watchers = 0): MemoryProfileRow {
  return { scenario, dimensions: { items, watchers } }
}

/** Expand size-sensitive states over 100/1,000/10,000 records. */
function matrix(scenarios: readonly MemoryScenarioDefinition[]): MemoryProfileRow[] {
  return scenarios.flatMap(scenario => [100, 1_000, 10_000].map(items => row(scenario, items, scenario.id === 'relation-reader' ? 1 : 0)))
}
