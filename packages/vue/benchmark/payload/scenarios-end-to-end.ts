import type { ResolvedCollection, StoreCore } from '@rstore/shared'
import type { CacheImplementation } from '../runtime'
import type { PayloadDimensions, PayloadScenarioRuntime } from './types'
import { createMany, createStoreCore, findMany, updateMany } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { invariant } from '../scenario-harness'
import { createWidePatches, createWideRecords, mutateSource, scalarValue } from './data'
import { finishPayloadRuntime, keyed, validateCardinality } from './scenario-runtime'

/** Build public findMany ingestion of one prebuilt wide result. */
export async function findManyWide(implementation: CacheImplementation, dimensions: PayloadDimensions): Promise<PayloadScenarioRuntime> {
  let source: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  const { store, collection } = await createPayloadStore(implementation)
  let hookCalls = 0
  store.$hooks.hook('fetchMany', (payload: any) => {
    hookCalls++
    payload.setResult(source ?? [])
  })
  let result: any[] | undefined
  return finishPayloadRuntime({
    cache: store.$cache,
    source,
    operate: async () => {
      result = (await findMany({ store, collection, findOptions: { fetchPolicy: 'cache-first' } })).result
    },
    onReleaseSource: () => { source = undefined },
    validate: () => {
      invariant(result?.length === dimensions.items, 'findMany result cardinality changed')
      invariant(hookCalls === 1, 'findMany adapter hook count changed')
      invariant(result?.[0]?.field0 === scalarValue(1, 0), 'findMany result detached value changed')
      validateCardinality(store.$cache, collection.name, dimensions.items)
    },
    teardown: () => { result = undefined },
  })
}

/** Build public createMany finalization through adapter hook. */
export async function createManyWide(implementation: CacheImplementation, dimensions: PayloadDimensions): Promise<PayloadScenarioRuntime> {
  let source: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  const { store, collection } = await createPayloadStore(implementation)
  let hookCalls = 0
  store.$hooks.hook('createMany', (payload: any) => {
    hookCalls++
    payload.setResult(payload.items as any[])
  })
  let result: any[] | undefined
  return finishPayloadRuntime({
    cache: store.$cache,
    source,
    operate: async () => {
      result = await createMany({ store, collection, items: source!, optimistic: false, skipCache: true })
      store.$cache.writeItems({ collection, items: keyed(result) })
    },
    onReleaseSource: () => { source = undefined },
    validate: () => {
      invariant(result?.length === dimensions.items, 'createMany result cardinality changed')
      invariant(hookCalls === 1, 'createMany adapter hook count changed')
      validateCardinality(store.$cache, collection.name, dimensions.items)
      const state = store.$cache.getState()
      invariant(state.collections[collection.name]?.['1']?.field0 === scalarValue(1, 0), 'createMany source was not detached')
    },
    teardown: () => { result = undefined },
  })
}

/** Build public updateMany finalization through adapter hook. */
export async function updateManyWide(implementation: CacheImplementation, dimensions: PayloadDimensions): Promise<PayloadScenarioRuntime> {
  const { store, collection } = await createPayloadStore(implementation)
  let seed: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  store.$cache.writeItems({ collection, items: keyed(seed) })
  mutateSource(seed)
  seed = undefined
  let source: any[] | undefined = createWidePatches(dimensions.items, dimensions.fields)
  let hookCalls = 0
  store.$hooks.hook('updateMany', (payload: any) => {
    hookCalls++
    payload.setResult(payload.items.map((entry: any) => entry.item))
  })
  let result: any[] | undefined
  return finishPayloadRuntime({
    cache: store.$cache,
    source,
    operate: async () => {
      result = await updateMany({ store, collection, items: source!, optimistic: false, skipCache: true })
      store.$cache.writeItems({ collection, items: keyed(result) })
    },
    onReleaseSource: () => { source = undefined },
    validate: () => {
      invariant(result?.length === dimensions.items, 'updateMany result cardinality changed')
      invariant(hookCalls === 1, 'updateMany adapter hook count changed')
      validateCardinality(store.$cache, collection.name, dimensions.items)
      const state = store.$cache.getState()
      invariant(state.collections[collection.name]?.['1']?.field0 === scalarValue(10_001, 0), 'updateMany value changed')
    },
    teardown: () => { result = undefined },
  })
}

/** Create public Core store using selected benchmark cache implementation. */
async function createPayloadStore(implementation: CacheImplementation): Promise<{
  /** Initialized store core. */
  store: StoreCore<any>
  /** Wide payload collection. */
  collection: ResolvedCollection<any, any, any>
}> {
  let store!: StoreCore<any>
  const cache = implementation.create({ getStore: () => store, isServer: false, tombstoneGc: false })
  store = await createStoreCore({ schema: [{ name: 'Payload' }], plugins: [], hooks: createHooks(), cache })
  return { store, collection: store.$collections[0]! }
}
