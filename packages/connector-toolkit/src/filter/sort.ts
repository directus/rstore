import type { UnsupportedEvaluation } from './types'
import { comparableValue } from './operators'
import { unsupported } from './types'

/**
 * Sort field normalized from a connector sort specifier.
 */
export interface NormalizedSortField {
  /**
   * Item field to sort by.
   */
  field: string

  /**
   * Whether the field sorts in descending order.
   */
  desc: boolean
}

/**
 * Result of normalizing a connector sort specifier.
 */
export type NormalizedSort = {
  /**
   * Whether the sort can be evaluated safely in the local cache.
   */
  supported: true

  /**
   * Normalized sort fields in priority order.
   */
  fields: NormalizedSortField[]
} | UnsupportedEvaluation

/**
 * Options accepted by {@link normalizeSort}.
 */
export interface NormalizeSortOptions {
  /**
   * Connector name used as prefix in unsupported-sort reasons.
   */
  dialectName?: string
}

/**
 * Options accepted by {@link sortItems}.
 */
export interface SortItemsOptions {
  /**
   * Reads the sortable value of a field from an item.
   *
   * Defaults to plain property access (`item[field]`).
   */
  readValue?: (item: Record<string, any>, field: string) => any
}

/**
 * Normalizes object/string sort specifiers into ordered sort fields.
 *
 * Accepts a field name, a single-entry object specifier (`{ field: 'desc' }`
 * or `{ field: { direction: 'desc' } }`), or an array of either form.
 * Specifiers with explicit nulls placement are rejected because the cache
 * cannot reproduce them.
 */
export function normalizeSort(sort: unknown, options: NormalizeSortOptions = {}): NormalizedSort {
  if (sort == null) {
    return { supported: true, fields: [] }
  }

  const entries = Array.isArray(sort) ? sort : [sort]
  const fields: NormalizedSortField[] = []

  for (const entry of entries) {
    const normalized = normalizeSortEntry(entry, options.dialectName)
    if ('reason' in normalized) {
      return normalized
    }
    fields.push(normalized)
  }

  return { supported: true, fields }
}

/**
 * Normalizes string sort specifiers where a `-` prefix means descending.
 */
export function normalizeSortStrings(sort: string | string[] | undefined): NormalizedSortField[] {
  if (!sort) {
    return []
  }

  const entries = Array.isArray(sort) ? sort : [sort]
  return entries.map((entry) => {
    const desc = entry.startsWith('-')
    return { field: desc ? entry.slice(1) : entry, desc }
  })
}

/**
 * Sorts items with normalized sort fields.
 *
 * Nulls sort last in ascending order and first in descending order,
 * matching common SQL defaults, and strings compare with `localeCompare`.
 */
export function sortItems<TItem extends Record<string, any>>(
  items: TItem[],
  fields: NormalizedSortField[],
  options: SortItemsOptions = {},
): TItem[] {
  if (!fields.length) {
    return items
  }

  const readValue = options.readValue ?? ((item: Record<string, any>, field: string) => item[field])

  return [...items].sort((a, b) => {
    for (const { field, desc } of fields) {
      const result = compareValues(comparableValue(readValue(a, field)), comparableValue(readValue(b, field)))
      if (result !== 0) {
        return desc ? -result : result
      }
    }
    return 0
  })
}

/**
 * Compares two comparable values, placing nulls after non-null values.
 */
export function compareValues(a: any, b: any): number {
  if (a == null && b == null) {
    return 0
  }
  if (a == null) {
    return 1
  }
  if (b == null) {
    return -1
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

/**
 * Normalizes one sort entry (field name or single-entry object).
 */
function normalizeSortEntry(entry: unknown, dialectName: string | undefined): NormalizedSortField | UnsupportedEvaluation {
  const prefix = dialectName ? `${dialectName} ` : ''

  if (typeof entry === 'string') {
    return { field: entry, desc: false }
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return unsupported(`${prefix}sort specifiers must be field names or objects`)
  }

  const keys = Object.keys(entry)
  const field = keys[0]
  if (keys.length !== 1 || !field) {
    return unsupported(`${prefix}sort objects must have exactly one field`)
  }

  const spec = (entry as Record<string, any>)[field]
  if (typeof spec === 'string') {
    return { field, desc: spec === 'desc' }
  }
  if (spec && typeof spec === 'object') {
    if (spec.nulls != null) {
      return unsupported(`${prefix}sort nulls placement cannot be evaluated cache-side`)
    }
    return { field, desc: spec.direction === 'desc' }
  }
  return unsupported(`Invalid ${prefix}sort specifier for "${field}"`)
}
