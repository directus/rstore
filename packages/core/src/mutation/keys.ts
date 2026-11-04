import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { isMutationItemEntry } from '@rstore/shared'
import { isKeyDefined } from '../key'

/** Return an item's collection key, unwrapping a keyed mutation entry first. */
export function getItemKey<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
  item: unknown,
): string | number | null | undefined {
  if (!item || typeof item !== 'object') {
    return undefined
  }
  return collection.getKey(isMutationItemEntry(item) ? item.item : item)
}

/** Convert a nullable key into the optional form carried by mutation hooks. */
export function normalizeKey(key: string | number | null | undefined): string | number | undefined {
  return key ?? undefined
}

/** Keep only defined keys, preserving absence when no usable key exists. */
export function getDefinedKeys(keys: Array<string | number | null | undefined>): Array<string | number> | undefined {
  const definedKeys = keys.filter(isKeyDefined)
  return definedKeys.length ? definedKeys : undefined
}
