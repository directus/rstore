/**
 * Monospace sort direction.
 */
export type MonospaceSortDirection = 'asc' | 'desc'

/**
 * Monospace per-field sort options (`SortFieldOptions` in the REST API).
 */
export interface MonospaceSortFieldOptions {
  /**
   * Sort direction, ascending when omitted.
   */
  direction?: MonospaceSortDirection

  /**
   * Placement of `null` values. Queries using it always require a fetch
   * because the cache cannot reproduce it.
   */
  nulls?: 'first' | 'last'
}

/**
 * Monospace sort specifier sent on the wire: one field mapped to its options
 * (`sort[0][field][direction]=desc`).
 */
export type MonospaceSortSpecifier = Record<string, MonospaceSortFieldOptions>

/**
 * Sort entry accepted by the rstore adapter.
 *
 * Besides the Monospace object form, a field name (`'title'`, `'-title'` for
 * descending) and a direction shorthand (`{ title: 'desc' }`) are accepted and
 * normalized to the object form before sending.
 */
export type MonospaceSortInput = string | Record<string, MonospaceSortDirection | MonospaceSortFieldOptions>

/**
 * Normalizes adapter sort input into Monospace object sort specifiers.
 *
 * Multi-field objects are split into one specifier per field, in key order.
 * Entries that cannot be normalized are kept as-is so Monospace reports them
 * and cache-side evaluation rejects them.
 */
export function normalizeMonospaceSort(sort: MonospaceSortInput | MonospaceSortInput[] | undefined): MonospaceSortSpecifier[] | undefined {
  if (sort == null) {
    return undefined
  }

  const result: MonospaceSortSpecifier[] = []
  for (const entry of Array.isArray(sort) ? sort : [sort]) {
    if (typeof entry === 'string') {
      // Monospace rejects the `-field` prefix syntax, so it is translated here.
      const desc = entry.startsWith('-')
      result.push({ [desc ? entry.slice(1) : entry]: { direction: desc ? 'desc' : 'asc' } })
      continue
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      result.push(entry as any)
      continue
    }
    for (const [field, spec] of Object.entries(entry)) {
      result.push({ [field]: normalizeSortFieldOptions(spec) })
    }
  }
  return result
}

/**
 * Normalizes the options of one sort field to the object form.
 */
function normalizeSortFieldOptions(spec: unknown): MonospaceSortFieldOptions {
  if (typeof spec === 'string') {
    return { direction: spec as MonospaceSortDirection }
  }
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    // An explicit direction keeps empty objects serializable.
    return { direction: 'asc', ...spec }
  }
  return spec as MonospaceSortFieldOptions
}
