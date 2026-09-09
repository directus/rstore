import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { VueStore } from './store'

/** Selection traversed for one occurrence of a related item. */
type RelationInclude = FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>

/** Create an empty payload used to collect a query page's cached identities. */
export function createTrackingObject(): HookMetaQueryTracking {
  return { items: {} }
}

/**
 * Record an item and every relation target selected by `include`.
 *
 * `visited` guards repeated item/selection pairs. An item reached again through
 * a different include must still contribute that selection's descendants.
 */
export function addToQueryTracking(
  store: VueStore,
  tracking: HookMetaQueryTracking,
  item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>,
  include?: RelationInclude,
  visited: Map<string, Set<RelationInclude | undefined>> = new Map(),
): void {
  if (!item.$collection) {
    return
  }
  const collection = store.$collections.find(collection => collection.name === item.$collection)
  if (!collection) {
    return
  }
  const key = item.$getKey()
  const visitKey = JSON.stringify([collection.name, String(key)])
  const selections = visited.get(visitKey) ?? new Set<RelationInclude | undefined>()
  if (selections.has(include)) {
    return
  }
  selections.add(include)
  visited.set(visitKey, selections)
  ;(tracking.items[collection.name] ??= new Set()).add(key)

  for (const relationName in collection.relations) {
    const relationInclude = include?.[relationName]
    if (!relationInclude || relationInclude === false) {
      continue
    }
    const value = item[relationName as keyof typeof item] as unknown as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | Array<WrappedItemBase<Collection, CollectionDefaults, StoreSchema>>
    for (const relatedItem of Array.isArray(value) ? value : [value]) {
      if (!relatedItem) {
        continue
      }
      const relatedCollection = relatedItem.$collection
        ? store.$collections.find(collection => collection.name === relatedItem.$collection)
        : undefined
      addToQueryTracking(
        store,
        tracking,
        relatedItem,
        relatedCollection ? resolveNestedInclude(relatedCollection.relations, relationInclude) : undefined,
        visited,
      )
    }
  }
}

/** Resolve the nested include shape accepted for a relation target. */
function resolveNestedInclude(
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
