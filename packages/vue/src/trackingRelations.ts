import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { VueStore } from './store'

/** Selection traversed for one occurrence of a related item. */
type RelationInclude = FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>

/** Selections already traversed, by collection name then stringified key. */
type VisitedSelections = Map<string, Map<string, Set<RelationInclude | undefined>>>

/** Resolved collection type stored in `store.$collections`. */
type StoreCollection = VueStore['$collections'][number]

/** Name lookups per collection list; rebuilt when `addCollections` appends. */
const collectionLookups = new WeakMap<readonly StoreCollection[], { size: number, byName: Map<string, StoreCollection> }>()

/**
 * Resolve a store collection by name without scanning the list per item.
 * Ownership traversals ask once per row and relation, so a linear `find`
 * dominated large cache-backed queries.
 */
export function findTrackedCollection(store: VueStore, name: string): StoreCollection | undefined {
  const collections = store.$collections
  let lookup = collectionLookups.get(collections)
  // Collections are only ever appended, so a length change means new names.
  if (!lookup || lookup.size !== collections.length) {
    lookup = { size: collections.length, byName: new Map(collections.map(collection => [collection.name, collection])) }
    collectionLookups.set(collections, lookup)
  }
  return lookup.byName.get(name)
}

/** Create an empty payload used to collect a query page's cached identities. */
export function createTrackingObject(): HookMetaQueryTracking {
  return { items: {} }
}

/**
 * Record an item and every relation target selected by `include`.
 *
 * `visited` guards repeated item/selection pairs. An item reached again through
 * a different include must still contribute that selection's descendants.
 * When `dirtyQueryId` is set, items already released by that query are skipped.
 */
export function addToQueryTracking(
  store: VueStore,
  tracking: HookMetaQueryTracking,
  item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>,
  include?: RelationInclude,
  visited: VisitedSelections = new Map(),
  dirtyQueryId?: string,
): void {
  if (!item.$collection || (dirtyQueryId && item.$meta.dirtyQueries.has(dirtyQueryId))) {
    return
  }
  const collection = findTrackedCollection(store, item.$collection)
  if (!collection) {
    return
  }
  const key = item.$getKey()
  // Nested maps avoid serializing a visit key for every traversed row.
  let collectionVisits = visited.get(collection.name)
  if (!collectionVisits) {
    collectionVisits = new Map()
    visited.set(collection.name, collectionVisits)
  }
  const visitKey = String(key)
  let selections = collectionVisits.get(visitKey)
  if (!selections) {
    selections = new Set()
    collectionVisits.set(visitKey, selections)
  }
  else if (selections.has(include)) {
    return
  }
  selections.add(include)
  ;(tracking.items[collection.name] ??= new Set()).add(key)

  for (const relationName in collection.relations) {
    const relationInclude = include?.[relationName]
    if (!relationInclude || relationInclude === false) {
      continue
    }
    // A relation embedded in this fetch is authoritative: only rows it wrote
    // belong to it. Still descend into them, since their own nested relation
    // fields may be omitted and must then fall back to the cache.
    const embedded = tracking.includedRelations?.[collection.name]?.get(key)?.has(relationName)
    const value = item[relationName as keyof typeof item] as unknown as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | Array<WrappedItemBase<Collection, CollectionDefaults, StoreSchema>>
    for (const relatedItem of Array.isArray(value) ? value : [value]) {
      if (!relatedItem || (embedded && !tracking.items[relatedItem.$collection]?.has(relatedItem.$getKey()))) {
        continue
      }
      const relatedCollection = relatedItem.$collection
        ? findTrackedCollection(store, relatedItem.$collection)
        : undefined
      addToQueryTracking(
        store,
        tracking,
        relatedItem,
        relatedCollection ? resolveNestedInclude(relatedCollection.relations, relationInclude) : undefined,
        visited,
        dirtyQueryId,
      )
    }
  }
}

/** Resolve the nested include shape accepted for a relation target. */
export function resolveNestedInclude(
  relations: Record<string, unknown>,
  include: unknown,
): FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> | undefined {
  if (!include || include === true || typeof include !== 'object') {
    return undefined
  }
  const candidate = include as Record<string, unknown>
  if ('include' in candidate) {
    const nested = candidate.include
    return nested && typeof nested === 'object'
      ? nested as FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>
      : undefined
  }
  return Object.keys(candidate).some(key => key in relations)
    ? candidate as FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>
    : undefined
}

/**
 * Populate tracking from visible items when hooks did not provide every key.
 * Items already released by `dirtyQueryId` are not adopted again.
 */
export function populateTracking<TResult>(
  store: VueStore,
  tracking: HookMetaQueryTracking,
  result: TResult | undefined,
  include: FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> | undefined,
  dirtyQueryId?: string,
): void {
  if (result == null || (!trackingIsEmpty(tracking) && !include)) {
    return
  }
  // Related graphs can converge from multiple visible roots. Keep one visit
  // set for this population pass while preserving isolated public traversals.
  const visited: VisitedSelections = new Map()
  for (const item of Array.isArray(result) ? result : [result]) {
    if (item && typeof item === 'object') {
      addToQueryTracking(store, tracking, item as WrappedItemBase<Collection, CollectionDefaults, StoreSchema>, include, visited, dirtyQueryId)
    }
  }
}

/** Whether a tracking payload holds no item identities. */
function trackingIsEmpty(tracking: HookMetaQueryTracking): boolean {
  return Object.values(tracking.items).every(keys => keys.size === 0)
}
