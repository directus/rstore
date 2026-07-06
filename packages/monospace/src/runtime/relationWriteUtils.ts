import type { MonospaceRelationCollectionLike, MonospaceRelationStoreLike } from './relations'
import type { MonospaceFieldTranslationContext } from './relationWrites'
import { MonospaceValidationError } from './errors'

/**
 * Returns whether a value already carries Monospace relation operations
 * (`_connect`, `_disconnect`, `_create`, `_update`, `_delete`), either as a
 * single operation object or as an array of operations.
 */
export function isMonospaceOperationPayload(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(entry => isMonospaceOperationPayload(entry))
  }
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return ['_connect', '_disconnect', '_create', '_update', '_delete'].some(key => key in value)
}

/**
 * Wire connect key plus the effective related item used for cache patches.
 */
export interface MonospaceConnectEntry {
  /**
   * Key object sent in the Monospace `_connect` operation.
   */
  key: Record<string, any>

  /**
   * Related item merged with any cache-resolved fields.
   */
  item: Record<string, any>
}

/**
 * Builds a Monospace connect key from a related item.
 *
 * Missing key columns (and `patchColumns` needed for cache patches) are
 * resolved from the cached target item when possible. With `require: 'some'`
 * (connects) at least one key column must resolve — backward connect inputs
 * accept any unique column subset. With `require: 'all'` (disconnect
 * filters) every column is mandatory so a partial filter can never
 * over-match.
 */
export function buildConnectEntry(
  ctx: MonospaceFieldTranslationContext,
  targetCollection: MonospaceRelationCollectionLike | undefined,
  value: any,
  keyColumns: string[],
  patchColumns: string[],
  require: 'some' | 'all' = 'some',
): MonospaceConnectEntry {
  let item: Record<string, any> = value && typeof value === 'object' ? { ...value } : {}
  const neededColumns = [...new Set([...keyColumns, ...patchColumns])]
  if (neededColumns.some(column => item[column] == null)) {
    const resolved = resolveTargetItemFromCache(ctx.store, targetCollection, item)
    if (resolved) {
      item = { ...resolved, ...item }
    }
  }

  const key: Record<string, any> = {}
  const missing: string[] = []
  for (const column of keyColumns) {
    if (item[column] != null) {
      key[column] = item[column]
    }
    else {
      missing.push(column)
    }
  }
  if (require === 'all' ? missing.length : !Object.keys(key).length) {
    throw new MonospaceValidationError(
      `Cannot write relation "${ctx.relationKey}" on collection "${ctx.collection.name}": missing connect key column(s) "${missing.join('", "')}" on the related item`,
    )
  }
  return { item, key }
}

/**
 * Resolves the full related item from the cache.
 *
 * The item is first looked up by its cache key when the primary keys are
 * available, then by matching its provided scalar columns against cached
 * items (only an unambiguous single match is used).
 */
export function resolveTargetItemFromCache(
  store: MonospaceRelationStoreLike | undefined,
  targetCollection: MonospaceRelationCollectionLike | undefined,
  value: Record<string, any>,
): Record<string, any> | undefined {
  if (!store?.$cache || !targetCollection) {
    return undefined
  }

  if (targetCollection.getKey && store.$cache.readItem) {
    const key = targetCollection.getKey(value)
    if (key != null) {
      const item = store.$cache.readItem({ collection: targetCollection, key })
      if (item) {
        return item
      }
    }
  }

  if (store.$cache.readItems) {
    const provided = Object.entries(value).filter(([, columnValue]) => {
      return columnValue != null && typeof columnValue !== 'object'
    })
    if (provided.length) {
      const matches = store.$cache.readItems({
        collection: targetCollection,
        filter: item => provided.every(([column, columnValue]) => item[column] === columnValue),
      })
      if (matches.length === 1) {
        return matches[0]
      }
    }
  }

  return undefined
}

/**
 * Returns whether two related items identify the same record.
 *
 * Items match when they agree on every shared identifying column and share
 * at least one, so partial connect payloads still match full cached items.
 */
export function relatedItemsMatch(
  a: Record<string, any>,
  b: Record<string, any>,
  columns: string[],
): boolean {
  let shared = 0
  for (const column of columns) {
    const aValue = a[column]
    const bValue = b[column]
    if (aValue == null || bValue == null) {
      continue
    }
    shared++
    if (aValue !== bValue) {
      return false
    }
  }
  return shared > 0
}

/**
 * Picks the given columns from an item, or returns `undefined` when any of
 * them is missing.
 */
export function pickItemColumns(
  item: Record<string, any>,
  columns: string[],
): Record<string, any> | undefined {
  const result: Record<string, any> = {}
  for (const column of columns) {
    if (item[column] == null) {
      return undefined
    }
    result[column] = item[column]
  }
  return result
}
