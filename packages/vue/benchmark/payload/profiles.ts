import type { PayloadProfile, PayloadProfileRow, PayloadScenarioDefinition } from './types'
import { compositeIndex, emptyLifecycle, getWideState, inputOnly, materializeWideWrappers, nestedRelations, replaceWide, scalarIndex, setWideState, writeDeep, writeNarrow, writeWide } from './scenarios-cache'
import { createManyWide, findManyWide, updateManyWide } from './scenarios-end-to-end'

const CONTROL = scenario('empty-lifecycle', 'empty store lifecycle', false, emptyLifecycle)
const INPUT = scenario('input-only-wide', 'input-only wide control', false, inputOnly)
const SMALL_WRITE = scenario('small-write', 'small three-field writeItems', false, writeNarrow)
const SMALL_REPLACE = scenario('small-replace', 'small three-field replacement', false, replaceWide)
const SMALL_WRAPPERS = scenario('small-wrappers', 'small full-list wrappers', false, materializeWideWrappers)
const WRITE_NARROW = scenario('write-narrow', 'initial writeItems: 50k narrow', true, writeNarrow)
const WRITE_WIDE = scenario('write-wide', 'initial writeItems: 10k x 64 fields', true, writeWide)
const WRITE_DEEP = scenario('write-deep', 'initial writeItems: 2k mixed deep', true, writeDeep)
const REPLACE_WIDE = scenario('replace-wide', 'partial replacement: 10k wide', true, replaceWide)
const GET_STATE = scenario('get-state-wide', 'getState: 10k wide', true, getWideState)
const SET_STATE = scenario('set-state-wide', 'setState: 10k wide', true, setWideState)
const WRAPPERS = scenario('materialize-wide', 'full-list wrappers: 10k wide', true, materializeWideWrappers)
const SCALAR_INDEX = scenario('scalar-index', 'scalar index: 50k records', true, scalarIndex)
const COMPOSITE_INDEX = scenario('composite-index', 'composite index: 50k records', true, compositeIndex)
const RELATIONS = scenario('nested-relations', 'nested relations: 2k x 10 children', true, nestedRelations)
const FIND_MANY = scenario('find-many-wide', 'public findMany: 10k wide', true, findManyWide)
const CREATE_MANY = scenario('create-many-wide', 'public createMany: 10k wide', true, createManyWide)
const UPDATE_MANY = scenario('update-many-wide', 'public updateMany: 10k wide', true, updateManyWide)

/** Fast local payload smoke profile. */
export const QUICK_PAYLOAD_PROFILE: PayloadProfile = {
  name: 'quick',
  rows: [
    row(CONTROL, 1, 0),
    row(INPUT, 1_000, 16),
    row(SMALL_WRITE, 1_000, 3),
    row(WRITE_WIDE, 1_000, 16),
    row(WRITE_DEEP, 250, 4, 4, 8),
    row(SMALL_REPLACE, 1_000, 3),
    row(SMALL_WRAPPERS, 1_000, 3),
    row(FIND_MANY, 1_000, 16),
  ],
}

/** Full exact big-payload and small-control profile. */
export const FULL_PAYLOAD_PROFILE: PayloadProfile = {
  name: 'full',
  rows: [
    row(CONTROL, 1, 0),
    row(INPUT, 10_000, 64),
    row(SMALL_WRITE, 1_000, 3),
    row(SMALL_REPLACE, 1_000, 3),
    row(SMALL_WRAPPERS, 1_000, 3),
    row(WRITE_NARROW, 50_000, 3),
    row(WRITE_WIDE, 10_000, 64),
    row(WRITE_DEEP, 2_000, 8, 8, 16),
    row(REPLACE_WIDE, 10_000, 64),
    row(GET_STATE, 10_000, 64, 0, 0, 8),
    row(SET_STATE, 10_000, 64),
    row(WRAPPERS, 10_000, 64),
    row(SCALAR_INDEX, 50_000, 3),
    row(COMPOSITE_INDEX, 50_000, 3),
    row(RELATIONS, 2_000, 3),
    row(FIND_MANY, 10_000, 64),
    row(CREATE_MANY, 10_000, 64),
    row(UPDATE_MANY, 10_000, 64),
  ],
}

/** Find one payload scenario across profile tiers. */
export function findPayloadScenario(id: string): PayloadScenarioDefinition | undefined {
  return FULL_PAYLOAD_PROFILE.rows.find(value => value.scenario.id === id)?.scenario
    ?? QUICK_PAYLOAD_PROFILE.rows.find(value => value.scenario.id === id)?.scenario
}

/** Attach stable scenario metadata. */
function scenario(id: string, name: string, large: boolean, build: PayloadScenarioDefinition['build']): PayloadScenarioDefinition {
  return { id, name, large, build }
}

/** Create one concrete profile row. */
function row(scenario: PayloadScenarioDefinition, items: number, fields: number, nestedObjects = 0, arrayLength = 0, operations = 1): PayloadProfileRow {
  return { scenario, dimensions: { items, fields, nestedObjects, arrayLength, operations } }
}
