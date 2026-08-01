import { createBatchedRelationFilter } from '@rstore/connector-toolkit'

export { toArray } from '@rstore/connector-toolkit'

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
 * Fetches included rstore relations through batched Directus filters.
 *
 * All parent items are matched with one filter per relation target (`_in`
 * for single-field joins, `_or`/`_and` groups for composite joins) so each
 * included relation costs a single request instead of one per parent item.
 */
export async function fetchIncludedRelations(
  store: DirectusRelationStoreLike,
  collection: DirectusRelationCollectionLike,
  items: Array<Record<string, any>>,
  include: Record<string, any>,
): Promise<void> {
  const keyed = items.filter(item => collection.getKey(item) != null)
  if (!keyed.length) {
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

    await Promise.all(relation.to.map(async (target) => {
      const filter = createBatchedRelationFilter(target.on, keyed)
      if (!filter) {
        return
      }

      const options = typeof include[relationKey] === 'object' && 'include' in include[relationKey]
        ? { filter, include: include[relationKey].include }
        : { filter }

      await store.$collection(target.collection).findMany(options)
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
