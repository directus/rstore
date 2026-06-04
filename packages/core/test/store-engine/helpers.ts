import type { CacheLayer, CollectionRelation, ResolvedCollection } from '@rstore/shared'
import type { EngineAfterWritePayload, EngineConflictPayload, StoreEngine } from '../../src'
import { createStoreEngine } from '../../src'

/**
 * Build a minimal {@link ResolvedCollection} for engine tests. Only the fields
 * the engine actually touches are populated.
 */
export function buildCollection(name: string, options: {
  getKey?: (item: any) => string | number
  relations?: Record<string, CollectionRelation>
  indexes?: Map<string, string[]>
} = {}): ResolvedCollection<any, any, any> {
  return {
    '~resolved': true,
    'name': name,
    'getKey': options.getKey ?? ((item: any) => item.id),
    'isInstanceOf': () => true,
    'relations': options.relations ?? {},
    'normalizedRelations': {},
    'oppositeRelations': {},
    'indexes': options.indexes ?? new Map(),
    'computed': {},
    'fields': {},
    'formSchema': {} as any,
    'hooks': undefined,
  } as ResolvedCollection<any, any, any>
}

/** Captured engine callback events, for assertions. */
export interface RecordedEvents {
  afterWrite: EngineAfterWritePayload[]
  conflicts: EngineConflictPayload[]
  layerAdd: CacheLayer[]
  layerRemove: CacheLayer[]
  reset: number
}

/**
 * Create an engine wired to in-memory test collections. `isServer` is set so
 * the tombstone GC timer never starts (keeps tests free of dangling timers).
 */
export function createTestEngine(
  collections: Array<ResolvedCollection<any, any, any>>,
  options: { cacheStaggering?: number } = {},
): { engine: StoreEngine, events: RecordedEvents, byName: Map<string, ResolvedCollection<any, any, any>> } {
  const byName = new Map(collections.map(c => [c.name, c]))
  const events: RecordedEvents = {
    afterWrite: [],
    conflicts: [],
    layerAdd: [],
    layerRemove: [],
    reset: 0,
  }

  const engine = createStoreEngine({
    isServer: true,
    cacheStaggering: options.cacheStaggering ?? 0,
    callbacks: {
      getCollection: name => byName.get(name),
      resolveChildCollection: (_item, names) => {
        for (const name of names) {
          const collection = byName.get(name)
          if (collection) {
            return collection
          }
        }
        return null
      },
      onAfterWrite: payload => events.afterWrite.push(payload),
      onConflict: payload => events.conflicts.push(payload),
      onLayerAdd: layer => events.layerAdd.push(layer),
      onLayerRemove: layer => events.layerRemove.push(layer),
      onReset: () => { events.reset++ },
    },
  })

  return { engine, events, byName }
}

/** Build an optimistic cache layer for a collection. */
export function buildLayer(
  id: string,
  collectionName: string,
  state: Record<string | number, any> = {},
  deletedItems: Array<string | number> = [],
): CacheLayer {
  return {
    id,
    collectionName,
    state,
    deletedItems: new Set(deletedItems),
    optimistic: true,
  }
}
