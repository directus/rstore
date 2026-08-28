import type { CacheLayer } from '@rstore/shared'
import type { CacheImplementation } from '../../runtime'
import type { MemoryDimensions, MemoryScenarioRuntime } from '../types'
import { createScenarioRuntime, invariant, seedScenarioItems, TODO_SCHEMA } from '../../scenario-harness'
import { finishMemoryScenario, stateCollectionSize } from '../scenario-runtime'

/** Build five overlapping optimistic layers over ten percent of records. */
export function optimisticLayers(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items, 'all')
  for (let layerIndex = 0; layerIndex < 5; layerIndex++)
    runtime.cache.addLayer(createLayer(layerIndex, dimensions.items))
  let checksum = 0
  return finishMemoryScenario(runtime, undefined, (index) => {
    const layer = createLayer(100 + index, dimensions.items, 'memory-cycle')
    runtime.cache.addLayer(layer)
    checksum += Number((runtime.cache.readItem({ collection, key: 1 }) as any)?.n ?? 0)
    runtime.cache.removeLayer(layer.id)
  }, () => {
    invariant(stateCollectionSize(runtime, collection.name) === dimensions.items, 'optimistic layers changed cardinality')
    invariant(runtime.cache.getLayer('memory-cycle') == null, 'temporary optimistic layer remained')
    invariant(checksum >= 0, 'optimistic layer checksum became invalid')
  })
}

/** Build repeated hydration while retaining one externally visible wrapper. */
export function hydrateRetainedWrapper(implementation: CacheImplementation, dimensions: MemoryDimensions): MemoryScenarioRuntime {
  const runtime = createScenarioRuntime(implementation, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seedScenarioItems(runtime.cache, collection, dimensions.items, 'all')
  const state = runtime.cache.getState()
  const retained = runtime.cache.readItem({ collection, key: 1 }) as any
  void retained.n
  return finishMemoryScenario(runtime, undefined, () => runtime.cache.setState(state), () => {
    invariant(retained.id === 1, 'retained wrapper became stale during hydration')
    invariant(stateCollectionSize(runtime, collection.name) === dimensions.items, 'hydration changed cardinality')
  })
}

/** Create deterministic layer state over every tenth record. */
function createLayer(index: number, items: number, fixedId?: string): CacheLayer {
  const state: Record<number, any> = {}
  for (let key = 1; key <= items; key += 10)
    state[key] = { n: index + 1 }
  return {
    id: fixedId ?? `memory-layer-${index}`,
    collectionName: 'Todo',
    state,
    deletedItems: new Set(),
    optimistic: true,
  }
}
