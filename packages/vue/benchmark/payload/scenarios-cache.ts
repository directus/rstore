import type { CacheImplementation } from '../runtime'
import type { PayloadDimensions, PayloadScenarioRuntime } from './types'
import { BLOG_SCHEMA, invariant, TODO_SCHEMA, VENUE_SCHEMA } from '../scenario-harness'
import { approximateSourceBytes, createDeepRecords, createNarrowRecords, createRelationRecords, createWidePatches, createWideRecords, mutateSource, scalarValue } from './data'
import { createDirectPayloadContext, finishPayloadRuntime, keyed, validateCardinality } from './scenario-runtime'

/** Build empty store lifecycle control. */
export function emptyLifecycle(implementation: CacheImplementation): PayloadScenarioRuntime {
  const { cache } = createDirectPayloadContext(implementation, TODO_SCHEMA)
  let checksum = 0
  return finishPayloadRuntime({
    cache,
    operate: () => { checksum++ },
    validate: () => invariant(checksum === 1, 'empty control did not run'),
  })
}

/** Build input-only allocation control without cache ingestion. */
export function inputOnly(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache } = createDirectPayloadContext(implementation, TODO_SCHEMA)
  let source: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  let checksum = 0
  return finishPayloadRuntime({
    cache,
    source,
    operate: () => { checksum = source!.length + String(source![0]?.field0).length },
    onReleaseSource: () => { source = undefined },
    validate: () => invariant(checksum > 0, 'input control was not consumed'),
  })
}

/** Build initial narrow-record ingestion. */
export function writeNarrow(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  return writeRecords(implementation, dimensions, createNarrowRecords(dimensions.items), 'label', 'item-1')
}

/** Build initial wide-record ingestion. */
export function writeWide(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  return writeRecords(implementation, dimensions, createWideRecords(dimensions.items, dimensions.fields), 'field0', scalarValue(1, 0))
}

/** Build initial deep mixed-record ingestion. */
export function writeDeep(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const source = createDeepRecords(dimensions.items, dimensions.nestedObjects, dimensions.fields, dimensions.arrayLength)
  return writeRecords(implementation, dimensions, source, 'nested0', structuredCopy(source[0]!.nested0))
}

/** Build partial replacement of already-wide records. */
export function replaceWide(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache, collection } = createDirectPayloadContext(implementation, TODO_SCHEMA)
  let seed: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  cache.writeItems({ collection, items: keyed(seed) })
  mutateSource(seed)
  seed = undefined
  let source: any[] | undefined = createWidePatches(dimensions.items, dimensions.fields)
  const expected = scalarValue(10_001, 0)
  return finishPayloadRuntime({
    cache,
    source,
    operate: () => cache.writeItems({ collection, items: keyed(source!) }),
    onReleaseSource: () => { source = undefined },
    validate: () => validateSnapshot(cache, collection.name, dimensions.items, 'field0', expected),
  })
}

/** Build wide snapshot serialization. */
export function getWideState(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache, collection } = createDirectPayloadContext(implementation, TODO_SCHEMA)
  let seed: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  const sourceBytes = approximateSourceBytes(seed)
  cache.writeItems({ collection, items: keyed(seed) })
  mutateSource(seed)
  seed = undefined
  let snapshot: any
  let checksum = 0
  return finishPayloadRuntime({
    cache,
    sourceBytes,
    operate: () => {
      for (let operation = 0; operation < dimensions.operations; operation++) {
        snapshot = cache.getState()
        checksum += Object.keys(snapshot.collections[collection.name] ?? {}).length
      }
    },
    onReleaseSource: () => { snapshot = undefined },
    validate: () => {
      invariant(checksum === dimensions.items * dimensions.operations, 'getState snapshot cardinality changed')
      validateSnapshot(cache, collection.name, dimensions.items, 'field0', scalarValue(1, 0))
    },
  })
}

/** Build wide snapshot hydration. */
export function setWideState(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache, collection } = createDirectPayloadContext(implementation, TODO_SCHEMA)
  let records: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  let source: any = { version: 1, collections: { [collection.name]: Object.fromEntries(records.map(item => [item.id, item])) }, markers: {}, modules: {}, queryMeta: {} }
  const sourceBytes = approximateSourceBytes(source)
  records = undefined
  return finishPayloadRuntime({
    cache,
    source: Object.values(source.collections[collection.name]),
    sourceBytes,
    mutateSourceOnRelease: false,
    operate: () => cache.setState(source),
    onReleaseSource: () => {
      // Historical hydration retains item values by contract, but must detach
      // from caller-owned snapshot containers and entry replacement.
      source.collections[collection.name]['1'] = { id: 1, field0: 'released-source-mutated' }
      source = undefined
    },
    validate: () => validateSnapshot(cache, collection.name, dimensions.items, 'field0', scalarValue(1, 0)),
  })
}

/** Build full-list wrapper materialization with repeated reads. */
export function materializeWideWrappers(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache, collection } = createDirectPayloadContext(implementation, TODO_SCHEMA)
  let source: any[] | undefined = createWideRecords(dimensions.items, dimensions.fields)
  const sourceBytes = approximateSourceBytes(source)
  cache.writeItems({ collection, items: keyed(source) })
  mutateSource(source)
  source = undefined
  let wrappers: any[] | undefined
  let repeated: any
  let checksum = 0
  return finishPayloadRuntime({
    cache,
    sourceBytes,
    operate: () => {
      wrappers = cache.readItems({ collection }) as any[]
      for (let repeat = 0; repeat < 3; repeat++) {
        repeated = (cache.readItems({ collection }) as any[])[repeat % dimensions.items]!
        checksum += repeated.id
      }
    },
    validate: () => {
      invariant(wrappers?.length === dimensions.items, 'wrapper count changed')
      invariant(wrappers?.[0]?.field0 === scalarValue(1, 0), 'wrapper payload changed')
      invariant(repeated === wrappers?.[2 % dimensions.items], 'wrapper identity changed across reads')
      invariant(checksum > 0, 'repeated wrapper reads were not consumed')
    },
    teardown: () => {
      wrappers = undefined
      repeated = undefined
    },
  })
}

/** Build scalar index construction and bounded membership churn. */
export function scalarIndex(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache, collections } = createDirectPayloadContext(implementation, BLOG_SCHEMA)
  const post = collections.find(value => value.name === 'Post')!
  const comment = collections.find(value => value.name === 'Comment')!
  cache.writeItem({ collection: post, key: 1, item: { id: 1 } })
  let source: any[] | undefined = createNarrowRecords(dimensions.items).map(item => ({ ...item, postId: item.id % 17 }))
  return finishPayloadRuntime({
    cache,
    source,
    operate: () => {
      cache.writeItems({ collection: comment, items: keyed(source!) })
      for (let index = 0; index < Math.min(1_000, dimensions.items); index++)
        cache.writeItem({ collection: comment, key: index + 1, item: { id: index + 1, postId: (index + 1) % 19 } })
    },
    onReleaseSource: () => { source = undefined },
    validate: () => validateCardinality(cache, comment.name, dimensions.items),
  })
}

/** Build composite index construction and bounded membership churn. */
export function compositeIndex(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache, collections } = createDirectPayloadContext(implementation, VENUE_SCHEMA)
  const event = collections.find(value => value.name === 'Event')!
  let source: any[] | undefined = createNarrowRecords(dimensions.items).map(item => ({ ...item, city: `city-${item.id % 101}`, room: `room-${item.id % 13}` }))
  return finishPayloadRuntime({
    cache,
    source,
    operate: () => {
      cache.writeItems({ collection: event, items: keyed(source!) })
      for (let index = 0; index < Math.min(1_000, dimensions.items); index++)
        cache.writeItem({ collection: event, key: index + 1, item: { id: index + 1, city: `next-${index % 17}`, room: `room-${index % 13}` } })
    },
    onReleaseSource: () => { source = undefined },
    validate: () => validateCardinality(cache, event.name, dimensions.items),
  })
}

/** Build nested relation ingestion containing ten children per parent. */
export function nestedRelations(implementation: CacheImplementation, dimensions: PayloadDimensions): PayloadScenarioRuntime {
  const { cache, collections } = createDirectPayloadContext(implementation, BLOG_SCHEMA)
  const post = collections.find(value => value.name === 'Post')!
  const comment = collections.find(value => value.name === 'Comment')!
  let source: any[] | undefined = createRelationRecords(dimensions.items, 10)
  return finishPayloadRuntime({
    cache,
    source,
    operate: () => cache.writeItems({ collection: post, items: keyed(source!) }),
    onReleaseSource: () => { source = undefined },
    validate: () => {
      validateCardinality(cache, post.name, dimensions.items)
      validateCardinality(cache, comment.name, dimensions.items * 10)
    },
  })
}

/** Build one generic initial write workflow. */
function writeRecords(implementation: CacheImplementation, dimensions: PayloadDimensions, initial: any[], field: string, expected: any): PayloadScenarioRuntime {
  const { cache, collection } = createDirectPayloadContext(implementation, TODO_SCHEMA)
  let source: any[] | undefined = initial
  return finishPayloadRuntime({
    cache,
    source,
    operate: () => cache.writeItems({ collection, items: keyed(source!) }),
    onReleaseSource: () => { source = undefined },
    validate: () => validateSnapshot(cache, collection.name, dimensions.items, field, expected),
  })
}

/** Validate cardinality and one detached representative value. */
function validateSnapshot(cache: any, collection: string, expectedItems: number, field: string, expected: any): void {
  const state = cache.getState()
  invariant(Object.keys(state.collections[collection] ?? {}).length === expectedItems, `${collection} cardinality changed`)
  const value = state.collections[collection]?.['1']?.[field]
  invariant(JSON.stringify(value) === JSON.stringify(expected), `${collection}.${field} changed after source release`)
}

/** Copy deterministic JSON-shaped expected data outside measured work. */
function structuredCopy(value: any): any {
  return JSON.parse(JSON.stringify(value))
}
