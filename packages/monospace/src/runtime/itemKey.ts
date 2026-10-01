import type { MonospaceItemKey } from './clientUtils'
import type { MonospaceCollectionLike } from './collection'
import type { MonospaceRelationStoreLike } from './relations'
import { createBatchedRelationFilter } from '@rstore/connector-toolkit'
import { getMonospacePrimaryKeys } from './collection'
import { MonospaceValidationError } from './errors'
import { pickItemColumns } from './relationWriteUtils'

/**
 * Separator joining primary key values in generated composite rstore keys
 * (see `createGetKeyExpression` in `@rstore/connector-toolkit`).
 */
const COMPOSITE_KEY_SEPARATOR = '::'

/**
 * Options accepted by {@link resolveMonospaceItemKey}.
 */
export interface ResolveMonospaceItemKeyOptions {
  /**
   * Collection the item belongs to.
   */
  collection: MonospaceCollectionLike & {
    /**
     * Computes the rstore cache key for an item of this collection.
     */
    getKey?: (item: Record<string, any>) => string | number | undefined | null
  }

  /**
   * rstore item key.
   */
  key: string | number

  /**
   * Item carried by the mutation, used as a fallback source of key column
   * values.
   */
  item?: Record<string, any>

  /**
   * Store whose cache provides the key column values of known items.
   */
  store?: MonospaceRelationStoreLike
}

/**
 * Resolves the REST client item key of an rstore item.
 *
 * Single primary key collections exposing item routes keep the scalar key
 * (`/items/{collection}/{key}`). Composite primary keys cannot go in the URL
 * path and collections without item routes have none, so both resolve to
 * their key column values, which the client turns into a filtered collection
 * request.
 */
export function resolveMonospaceItemKey(options: ResolveMonospaceItemKeyOptions): MonospaceItemKey {
  const primaryKeys = getMonospacePrimaryKeys(options.collection)
  if (primaryKeys.length === 1 && options.collection.meta?.monospace?.itemRoutes !== false) {
    return options.key
  }
  return resolveMonospaceKeyValues(options)
}

/**
 * Resolves the primary key column values of an rstore item key.
 *
 * Values are read, in order, from the key itself (single primary key), the
 * cached item, the mutation item (only when it produces the same rstore
 * key), and finally from the generated `a::b` composite key, split in
 * primary key order (values are then strings, which Monospace accepts for
 * any key type).
 */
export function resolveMonospaceKeyValues(options: ResolveMonospaceItemKeyOptions): Record<string, string | number> {
  const { collection, item, key, store } = options
  const primaryKeys = getMonospacePrimaryKeys(collection)
  if (primaryKeys.length === 1) {
    return { [primaryKeys[0]!]: key }
  }

  const cached = store?.$cache?.readItem?.({ collection, key })
  const cachedValues = cached && pickItemColumns(cached, primaryKeys)
  if (cachedValues) {
    return cachedValues
  }

  const itemValues = item && pickItemColumns(item, primaryKeys)
  if (itemValues && (!collection.getKey || collection.getKey(itemValues) === key)) {
    return itemValues
  }

  const parts = String(key).split(COMPOSITE_KEY_SEPARATOR)
  if (parts.length === primaryKeys.length) {
    return Object.fromEntries(primaryKeys.map((column, index) => [column, parts[index]!]))
  }

  throw new MonospaceValidationError(
    `Cannot resolve the primary key column(s) "${primaryKeys.join('", "')}" of item "${key}" in collection "${collection.name}"`,
  )
}

/**
 * Creates the filter matching many items by their rstore keys: an `_in`
 * filter for single primary keys, an `_or` of key column groups for
 * composite primary keys. Returns `undefined` when no key is given.
 */
export function createMonospaceKeysFilter(
  options: Omit<ResolveMonospaceItemKeyOptions, 'key' | 'item'> & {
    /**
     * rstore item keys to match.
     */
    keys: Array<string | number>
  },
): Record<string, any> | undefined {
  const primaryKeys = getMonospacePrimaryKeys(options.collection)
  const values = options.keys.map(key => resolveMonospaceKeyValues({ ...options, key }))
  // The join map pairs every primary key column with itself.
  return createBatchedRelationFilter(Object.fromEntries(primaryKeys.map(column => [column, column])), values)
}
