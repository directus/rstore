/** Return whether a value is a mutation item entry with an optional key. */
export function isMutationItemEntry(item: unknown): item is { key?: string | number, item: unknown } {
  return !!item && typeof item === 'object' && 'item' in item && ('key' in item || Object.keys(item).length === 1)
}

/** Return the actual item carried by a plain item or mutation item entry. */
export function unwrapMutationItem<T>(item: T | { key?: string | number, item: T }): T {
  return isMutationItemEntry(item) ? item.item as T : item as T
}

/** Return the explicit key carried by a mutation item entry. */
export function getMutationItemKey(item: unknown): string | number | undefined {
  return isMutationItemEntry(item) ? item.key : undefined
}
