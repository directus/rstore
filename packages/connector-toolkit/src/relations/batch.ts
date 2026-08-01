/**
 * Options accepted by {@link createBatchedRelationFilter}.
 */
export interface BatchedRelationFilterOptions {
  /**
   * Reads a source field value from an item.
   *
   * Defaults to plain property access (`item[field]`).
   */
  readValue?: (item: Record<string, any>, field: string) => any
}

/**
 * Creates a batched filter matching many items through a relation join map.
 *
 * `on` maps target collection fields to source item fields. A single-entry
 * map produces a deduplicated `_in` filter; a composite map produces an
 * `_or` of `_and` equality groups, skipping items with missing source
 * values. Returns `undefined` when no item yields usable values.
 */
export function createBatchedRelationFilter(
  on: Record<string, string>,
  items: Array<Record<string, any>>,
  options: BatchedRelationFilterOptions = {},
): Record<string, any> | undefined {
  const readValue = options.readValue ?? ((item: Record<string, any>, field: string) => item[field])
  const entries = Object.entries(on)

  if (entries.length === 1) {
    const [targetField, sourceField] = entries[0]!
    const keys = [...new Set(items.map(item => readValue(item, sourceField)).filter(value => value != null))]
    return keys.length ? { [targetField]: { _in: keys } } : undefined
  }

  // Composite joins match tuples of values, deduplicated by their JSON key.
  const seen = new Set<string>()
  const groups: Array<Record<string, any>> = []
  for (const item of items) {
    const values = entries.map(([, sourceField]) => readValue(item, sourceField))
    if (values.some(value => value == null)) {
      continue
    }
    const key = JSON.stringify(values)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    groups.push({
      _and: entries.map(([targetField], index) => ({
        [targetField]: { _eq: values[index] },
      })),
    })
  }
  return groups.length ? { _or: groups } : undefined
}
