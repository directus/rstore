import type { CacheLayer, ResolvedCollection } from '@rstore/shared'
import process from 'node:process'
import { createStoreEngine, resolveCollections } from '@rstore/core'
import { Bench } from 'tinybench'
import { createCache as createEngineCache } from '../src/cache'
import { createCacheRuntime } from './runtime'
import { TODO_SCHEMA } from './scenario-harness'

const ITEM_COUNT = 1000
const EXPECTED_SUM = Math.ceil(ITEM_COUNT / 10) * 5

/** Run raw-engine versus wrapped-field layered read decomposition. */
async function run(): Promise<void> {
  const raw = createRawReader()
  const wrapped = createWrappedReader()
  validateReader(raw)
  validateReader(wrapped)
  const bench = new Bench({ time: 500, warmupTime: 100, iterations: 10, warmupIterations: 10 })
  bench.add('raw-layered-engine-read', raw.read)
  bench.add('wrapped-layered-field-read', wrapped.read)
  await bench.run()
  const rows = bench.tasks.map(task => ({
    scenarioId: task.name,
    items: ITEM_COUNT,
    meanMicroseconds: task.result!.mean * 1000,
    rme: task.result!.rme,
    samples: task.result!.samples.length,
  }))
  console.table(rows)
  console.log(JSON.stringify({
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    rows,
    wrappedOverhead: rows[1]!.meanMicroseconds / rows[0]!.meanMicroseconds,
  }, null, 2))
  raw.dispose()
  wrapped.dispose()
}

/** Create a raw StoreEngine reader under five optimistic layers. */
function createRawReader(): DecompositionReader {
  const collection = resolveCollections(TODO_SCHEMA)[0] as ResolvedCollection<any, any, any>
  const engine = createStoreEngine({
    isServer: true,
    callbacks: {
      getCollection: name => name === collection.name ? collection : undefined,
      resolveChildCollection: () => null,
    },
  })
  seed((items, marker) => engine.writeItems({ collection, items, marker }), layer => engine.addLayer(layer), collection.name)
  const keys = engine.resolveKeys({ collection, marker: 'all' })
  return {
    read() {
      let sum = 0
      for (const key of keys) sum += Number(engine.readItemRaw({ collection, key })?.n ?? 0)
      return sum
    },
    dispose: () => engine.dispose(),
  }
}

/** Create a Vue wrapper reader over equivalent engine state. */
function createWrappedReader(): DecompositionReader {
  const runtime = createCacheRuntime({ name: 'engine', create: createEngineCache as any }, TODO_SCHEMA)
  const collection = runtime.collections[0]!
  seed(
    (items, marker) => runtime.cache.writeItems({ collection, items, marker }),
    layer => runtime.cache.addLayer(layer),
    collection.name,
  )
  const items = runtime.cache.readItems({ collection, marker: 'all' }) as any[]
  return {
    read() {
      let sum = 0
      for (const item of items) sum += Number(item.n ?? 0)
      return sum
    },
    dispose: () => runtime.cache.dispose(),
  }
}

/** Seed identical base rows and five overlapping layers. */
function seed(
  write: (items: Array<{ key: number, value: any }>, marker: string) => void,
  addLayer: (layer: CacheLayer) => void,
  collectionName: string,
): void {
  write(Array.from({ length: ITEM_COUNT }, (_, index) => {
    const key = index + 1
    return { key, value: { id: key, n: 0 } }
  }), 'all')
  for (let layerIndex = 0; layerIndex < 5; layerIndex++) {
    const state: Record<number, any> = {}
    for (let key = 1; key <= ITEM_COUNT; key += 10) state[key] = { n: layerIndex + 1 }
    addLayer({ id: `opt-${layerIndex}`, collectionName, state, deletedItems: new Set(), optimistic: true })
  }
}

/** Validate semantic checksum before entering timed regions. */
function validateReader(reader: DecompositionReader): void {
  const sum = reader.read()
  if (sum !== EXPECTED_SUM)
    throw new Error(`Layered read checksum was ${sum}, expected ${EXPECTED_SUM}`)
}

/** One bounded read workload and its cleanup. */
interface DecompositionReader {
  /** Read every layered field and return checksum. */
  read: () => number
  /** Dispose owned cache state. */
  dispose: () => void
}

void run()
