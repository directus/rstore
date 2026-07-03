/**
 * rstore relation target shape used by generated Directus collections.
 */
export interface DirectusRelationTargetLike {
  /**
   * Target collection name.
   */
  collection: string

  /**
   * Mapping from target fields to source item fields.
   */
  on: Record<string, string>
}

/**
 * rstore relation shape used by generated Directus collections.
 */
export interface DirectusRelationLike {
  /**
   * Target collections reachable through this relation.
   */
  to: DirectusRelationTargetLike[]
}

/**
 * Collection shape required for relation fetches.
 */
export interface DirectusRelationCollectionLike {
  /**
   * Collection name used in error messages.
   */
  name: string

  /**
   * Reads the collection key for one item.
   */
  getKey: (item: Record<string, any>) => string | number | null | undefined

  /**
   * Normalized rstore relations keyed by relation field.
   */
  normalizedRelations: Record<string, DirectusRelationLike | undefined>
}

/**
 * Store shape required for relation fetches.
 */
export interface DirectusRelationStoreLike {
  /**
   * Returns a collection API by name.
   */
  $collection: (name: string) => {
    /**
     * Fetches many relation target records.
     */
    findMany: (options: Record<string, any>) => Promise<unknown>
  }
}

/**
 * Normalizes a possible single result to an array.
 */
export function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

/**
 * Fetches included rstore relations through Directus filters.
 */
export async function fetchIncludedRelations(
  store: DirectusRelationStoreLike,
  collection: DirectusRelationCollectionLike,
  item: Record<string, any>,
  include: Record<string, any>,
): Promise<void> {
  const itemKey = collection.getKey(item)
  if (itemKey == null) {
    return
  }

  for (const relationKey in include) {
    if (!include[relationKey]) {
      continue
    }

    const relation = collection.normalizedRelations[relationKey]
    if (!relation) {
      throw new Error(`Relation "${relationKey}" does not exist on collection "${collection.name}"`)
    }

    await Promise.all(relation.to.map((target) => {
      const filter = createRelationFilter(target.on, item)
      const options = typeof include[relationKey] === 'object' && 'include' in include[relationKey]
        ? { filter, include: include[relationKey].include }
        : { filter }

      return store.$collection(target.collection).findMany(options)
    }))
  }
}

/**
 * Creates a Directus filter for a normalized rstore relation target.
 */
export function createRelationFilter(
  on: Record<string, string>,
  item: Record<string, any>,
): Record<string, any> {
  const filters = Object.entries(on).map(([targetField, sourceField]) => ({
    [targetField]: {
      _eq: item[sourceField],
    },
  }))

  return filters.length === 1 ? filters[0]! : { _and: filters }
}
