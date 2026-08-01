import { createBatchedRelationFilter, isRecord, toArray } from '@rstore/connector-toolkit'
import { getMonospacePrimaryKeys } from './collection'

export { toArray } from '@rstore/connector-toolkit'

/**
 * rstore relation target shape used by generated Monospace collections.
 */
export interface MonospaceRelationTargetLike {
  /**
   * Target collection name.
   */
  collection: string

  /**
   * Mapping from target collection fields to source collection fields
   * (real FK columns, for example `{ id: 'author_id' }` on a forward
   * to-one relation).
   */
  on: Record<string, string>
}

/**
 * Normalized rstore relation shape used by generated Monospace collections.
 */
export interface MonospaceRelationLike {
  /**
   * Whether the relation resolves to many items.
   */
  many?: boolean

  /**
   * Target collections reachable through this relation.
   */
  to: MonospaceRelationTargetLike[]
}

/**
 * Collection shape required by Monospace relation helpers.
 */
export interface MonospaceRelationCollectionLike {
  /**
   * Collection name used in error messages and store lookups.
   */
  name: string

  /**
   * Generated Monospace collection metadata.
   */
  meta?: {
    /**
     * Primary key fields generated for REST item endpoints.
     */
    primaryKeys?: string[]

    /**
     * Monospace-specific generated collection metadata.
     */
    monospace?: {
      /**
       * Original Monospace collection name.
       */
      collection?: string

      /**
       * Generated relation metadata keyed by relation field.
       */
      relations?: Record<string, {
        /**
         * Connect key columns accepted by `_connect` operations.
         */
        connectKeys?: string[]
      }>
    }
  }

  /**
   * Computes the rstore cache key for an item of this collection.
   */
  getKey?: (item: Record<string, any>) => string | number | undefined | null

  /**
   * Normalized rstore relations keyed by relation field.
   */
  normalizedRelations?: Record<string, MonospaceRelationLike | undefined>
}

/**
 * rstore cache shape required by Monospace relation helpers.
 */
export interface MonospaceRelationCacheLike {
  /**
   * Reads one cached item by key.
   */
  readItem?: (params: { collection: any, key: string | number }) => Record<string, any> | undefined

  /**
   * Reads cached items matching an optional predicate.
   */
  readItems?: (params: { collection: any, filter?: (item: any) => boolean }) => Array<Record<string, any>>

  /**
   * Writes (merges) a partial item into the cache.
   */
  writeItem?: (params: { collection: any, key: string | number, item: Record<string, any> }) => void
}

/**
 * Store shape required by Monospace relation helpers.
 */
export interface MonospaceRelationStoreLike {
  /**
   * Resolved collections registered in the store.
   */
  $collections?: MonospaceRelationCollectionLike[]

  /**
   * Returns a collection API by name.
   */
  $collection?: (name: string) => {
    /**
     * Fetches many records through the regular query pipeline.
     */
    findMany: (options: Record<string, any>) => Promise<unknown>
  }

  /**
   * rstore cache used to resolve relation joins.
   */
  $cache?: MonospaceRelationCacheLike
}

/**
 * Normalizes relation fields on fetched Monospace items in place.
 *
 * To-many `{ data }` envelopes are unwrapped to plain arrays so items match
 * the generated array typing, and embedded related items are normalized
 * recursively. Relations join on real FK columns returned by the API, so no
 * extra fields are injected.
 */
export function normalizeMonospaceRelationItems(
  store: MonospaceRelationStoreLike | undefined,
  collection: MonospaceRelationCollectionLike,
  items: unknown[],
  seen: WeakSet<object> = new WeakSet(),
): void {
  for (const item of items) {
    if (!isRecord(item) || seen.has(item)) {
      continue
    }
    seen.add(item)

    const relations = collection.normalizedRelations ?? {}
    for (const relationKey in relations) {
      const relation = relations[relationKey]
      // Only unambiguous single-target relations can be normalized.
      if (!relation || relation.to.length !== 1 || !(relationKey in item)) {
        continue
      }

      const target = relation.to[0]!
      const targetCollection = store?.$collections?.find(other => other.name === target.collection)

      let value = item[relationKey]
      if (relation.many && isRecord(value) && Array.isArray(value.data)) {
        // Unwrap the REST `{ data }` envelope of embedded to-many relations.
        value = value.data
        item[relationKey] = value
      }
      if (targetCollection) {
        normalizeMonospaceRelationItems(store, targetCollection, toArray(value as any), seen)
      }
    }
  }
}

/**
 * Fetches included relations that are missing from served results.
 *
 * Results coming from a fresh fetch already embed the included relation
 * fields, so this only re-fetches items served from the cache. A to-one
 * relation whose join already resolves through its FK columns (a `null` FK
 * or a cached target item) is not re-fetched. The re-fetch goes through the
 * store with `fetch-only` so both the parent items and the embedded related
 * items are written back to the cache in one request.
 */
export async function fetchMissingMonospaceRelations(
  store: MonospaceRelationStoreLike,
  collection: MonospaceRelationCollectionLike,
  items: unknown[],
  include: Record<string, any> | undefined,
): Promise<void> {
  const includedKeys = Object.keys(include ?? {}).filter(key => include![key])
  if (!includedKeys.length) {
    return
  }

  for (const key of includedKeys) {
    if (!collection.normalizedRelations?.[key]) {
      throw new Error(`Relation "${key}" does not exist on collection "${collection.name}"`)
    }
  }

  // Wrapped cache items report relation keys as present through their proxy,
  // so presence is checked on the raw item data instead.
  const missing = items
    .map(item => unwrapItem(item))
    .filter((item): item is Record<string, any> => {
      return isRecord(item) && includedKeys.some(key => !isRelationSatisfied(store, collection, item, key))
    })
  if (!missing.length) {
    return
  }

  const filter = createPrimaryKeyFilter(collection, missing)
  if (!filter) {
    return
  }

  await store.$collection?.(collection.name).findMany({
    fetchPolicy: 'fetch-only',
    filter,
    include,
  })
}

/**
 * Returns whether an included relation is already satisfied for an item.
 *
 * A relation is satisfied when its field is embedded on the raw item, or —
 * for single-target to-one relations — when the join resolves from the FK
 * columns alone: a `null` FK means an empty relation and a non-null FK is
 * satisfied when the target item is already cached. To-many relations
 * cannot distinguish "not loaded" from "no related items", so they are only
 * satisfied by an embedded field.
 */
function isRelationSatisfied(
  store: MonospaceRelationStoreLike,
  collection: MonospaceRelationCollectionLike,
  item: Record<string, any>,
  relationKey: string,
): boolean {
  if (relationKey in item) {
    return true
  }

  const relation = collection.normalizedRelations?.[relationKey]
  if (!relation || relation.many || relation.to.length !== 1) {
    return false
  }

  const target = relation.to[0]!
  const sourceValues = Object.values(target.on).map(sourceField => item[sourceField])
  if (sourceValues.includes(undefined)) {
    // The FK columns were not fetched: the join state is unknown.
    return false
  }
  if (sourceValues.includes(null)) {
    // A null FK column means the relation is empty.
    return true
  }

  const targetCollection = store.$collections?.find(other => other.name === target.collection)
  if (!targetCollection || !store.$cache?.readItems) {
    return false
  }
  const matches = store.$cache.readItems({
    collection: targetCollection,
    filter: candidate => Object.entries(target.on).every(([targetField, sourceField]) => {
      return candidate[targetField] === item[sourceField]
    }),
  })
  return matches.length > 0
}

/**
 * Creates a primary key filter matching a list of items.
 */
function createPrimaryKeyFilter(
  collection: MonospaceRelationCollectionLike,
  items: Array<Record<string, any>>,
): Record<string, any> | undefined {
  // Batching by primary keys is a relation join of each key onto itself.
  const primaryKeys = getMonospacePrimaryKeys(collection)
  return createBatchedRelationFilter(
    Object.fromEntries(primaryKeys.map(primaryKey => [primaryKey, primaryKey])),
    items,
  )
}

/**
 * Returns the raw item data behind a wrapped rstore item.
 */
function unwrapItem(item: unknown): unknown {
  if (isRecord(item) && typeof item.$raw === 'function') {
    return item.$raw()
  }
  return item
}
