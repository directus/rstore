import type { MonospaceRelationStoreLike } from './relations'

/**
 * Cache patch that updates the real FK columns on a to-many target item.
 */
export interface MonospaceToManyCachePatch {
  type: 'to-many'

  /**
   * Name of the target rstore collection.
   */
  targetCollection: string

  /**
   * Primary key field values identifying the target item.
   */
  targetKeyFields: Record<string, any>

  /**
   * Relation mapping from the target FK columns to the source key fields.
   */
  on: Record<string, string>

  /**
   * Whether the target item was connected (`true`) or disconnected (`false`).
   */
  connected: boolean
}

/**
 * Cache reconciliation patch produced by a translated relational write.
 *
 * Only to-many writes need patches: to-one writes set the real FK columns on
 * the mutation body and the mutation response carries them back, so the
 * cached item is already consistent.
 */
export type MonospaceRelationCachePatch = MonospaceToManyCachePatch

/**
 * Applies relational write patches after a successful mutation so relation
 * accessors resolve without a refetch.
 *
 * To-many patches merge the real FK column values onto the affected target
 * items in the cache — pointing them at the mutated parent on connect and
 * clearing them on disconnect — mirroring what the API does server-side.
 */
export function applyMonospaceRelationCachePatches(
  store: MonospaceRelationStoreLike | undefined,
  resultItem: unknown,
  patches: MonospaceRelationCachePatch[],
): void {
  if (!patches.length || typeof resultItem !== 'object' || resultItem === null) {
    return
  }
  const result = resultItem as Record<string, any>

  for (const patch of patches) {
    applyToManyPatch(store, result, patch)
  }
}

/**
 * Merges one FK column patch onto a target item in the cache.
 */
function applyToManyPatch(
  store: MonospaceRelationStoreLike | undefined,
  result: Record<string, any>,
  patch: MonospaceToManyCachePatch,
): void {
  const targetCollection = store?.$collections?.find(other => other.name === patch.targetCollection)
  if (!targetCollection || !store?.$cache?.writeItem) {
    return
  }
  const key = targetCollection.getKey?.(patch.targetKeyFields)
  if (key == null) {
    return
  }

  // The merged item carries its own primary keys plus the FK columns
  // pointing at the mutated parent (or `null` on disconnect).
  const item: Record<string, any> = { ...patch.targetKeyFields }
  for (const [targetField, sourceField] of Object.entries(patch.on)) {
    const value = patch.connected ? result[sourceField] : null
    if (patch.connected && value == null) {
      // The mutation result is missing the parent join value: skip rather
      // than writing a broken FK column.
      return
    }
    item[targetField] = value
  }

  store.$cache.writeItem({ collection: targetCollection, key, item })
}
