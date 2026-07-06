/* eslint-disable eqeqeq */

import type { MonospaceFilterEvaluation, MonospaceUnsupportedEvaluation } from './types'
import { supported, unsupported } from './types'

/**
 * Sort field normalized from a Monospace sort specifier.
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
 * Result of normalizing a Monospace sort specifier.
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
} | MonospaceUnsupportedEvaluation

/**
 * Evaluates one Monospace field operator.
 */
export function evaluateOperator(itemValue: any, operator: string, value: any): MonospaceFilterEvaluation {
  const comparableItem = comparableValue(itemValue)
  const comparableFilter = comparableValue(value)

  switch (operator) {
    case '_eq':
      return supported(itemValue == value)
    case '_neq':
      return supported(itemValue != value)
    case '_lt':
      return supported(comparableItem < comparableFilter)
    case '_lte':
      return supported(comparableItem <= comparableFilter)
    case '_gt':
      return supported(comparableItem > comparableFilter)
    case '_gte':
      return supported(comparableItem >= comparableFilter)
    case '_in':
      return supported(Array.isArray(value) && value.some(entry => itemValue == entry))
    case '_nin':
      return supported(Array.isArray(value) && !value.some(entry => itemValue == entry))
    case '_null':
      // Monospace `_null` takes a boolean: true matches null, false matches non-null.
      return typeof value === 'boolean'
        ? supported(value ? itemValue == null : itemValue != null)
        : unsupported('_null expects a boolean value')
    case '_contains':
      return supported(compareText(itemValue, value, false, (left, right) => left.includes(right)))
    case '_icontains':
      return supported(compareText(itemValue, value, true, (left, right) => left.includes(right)))
    case '_ncontains':
      return supported(!compareText(itemValue, value, false, (left, right) => left.includes(right)))
    case '_nicontains':
      return supported(!compareText(itemValue, value, true, (left, right) => left.includes(right)))
    case '_starts_with':
      return supported(compareText(itemValue, value, false, (left, right) => left.startsWith(right)))
    case '_nstarts_with':
      return supported(!compareText(itemValue, value, false, (left, right) => left.startsWith(right)))
    case '_ends_with':
      return supported(compareText(itemValue, value, false, (left, right) => left.endsWith(right)))
    case '_nends_with':
      return supported(!compareText(itemValue, value, false, (left, right) => left.endsWith(right)))
    case '_between':
      return supported(Array.isArray(value) && value.length === 2 && comparableItem >= comparableValue(value[0]) && comparableItem <= comparableValue(value[1]))
    case '_nbetween':
      return supported(Array.isArray(value) && value.length === 2 && !(comparableItem >= comparableValue(value[0]) && comparableItem <= comparableValue(value[1])))
    default:
      return unsupported(`Filter operator not supported: ${operator}`)
  }
}

/**
 * Normalizes Monospace sort specifiers into ordered sort fields.
 */
export function normalizeSort(sort: unknown): NormalizedSort {
  if (sort == null) {
    return { supported: true, fields: [] }
  }

  const entries = Array.isArray(sort) ? sort : [sort]
  const fields: NormalizedSortField[] = []

  for (const entry of entries) {
    const normalized = normalizeSortEntry(entry)
    if ('reason' in normalized) {
      return normalized
    }
    fields.push(normalized)
  }

  return { supported: true, fields }
}

/**
 * Sorts items with normalized Monospace sort fields.
 *
 * Nulls sort last in ascending order and first in descending order,
 * matching the PostgreSQL defaults used by Monospace.
 */
export function sortItems<TItem extends Record<string, any>>(items: TItem[], fields: NormalizedSortField[]): TItem[] {
  if (!fields.length) {
    return items
  }

  return [...items].sort((a, b) => {
    for (const { field, desc } of fields) {
      const result = compareValues(comparableValue(a[field]), comparableValue(b[field]))
      if (result !== 0) {
        return desc ? -result : result
      }
    }
    return 0
  })
}

/**
 * Applies Monospace limit and offset options to an item list.
 *
 * Monospace treats `limit` values of `0` and `-1` as unlimited.
 */
export function paginateItems<TItem>(items: TItem[], query: Record<string, any> | undefined): TItem[] {
  const limit = typeof query?.limit === 'number' && query.limit > 0 ? query.limit : undefined
  const offset = typeof query?.offset === 'number' ? query.offset : 0
  return limit == null ? items.slice(offset) : items.slice(offset, offset + limit)
}

/**
 * Converts values into a stable primitive for ordering comparisons.
 */
export function comparableValue(value: any): any {
  if (value instanceof Date) {
    return value.valueOf()
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    if (!Number.isNaN(timestamp) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return timestamp
    }
  }
  return value
}

/**
 * Normalizes one Monospace sort entry (field name or single-entry object).
 */
function normalizeSortEntry(entry: unknown): NormalizedSortField | MonospaceUnsupportedEvaluation {
  if (typeof entry === 'string') {
    return { field: entry, desc: false }
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return unsupported('Monospace sort specifiers must be field names or objects')
  }

  const keys = Object.keys(entry)
  const field = keys[0]
  if (keys.length !== 1 || !field) {
    return unsupported('Monospace sort objects must have exactly one field')
  }

  const spec = (entry as Record<string, any>)[field]
  if (typeof spec === 'string') {
    return { field, desc: spec === 'desc' }
  }
  if (spec && typeof spec === 'object') {
    if (spec.nulls != null) {
      return unsupported('Monospace sort nulls placement cannot be evaluated cache-side')
    }
    return { field, desc: spec.direction === 'desc' }
  }
  return unsupported(`Invalid Monospace sort specifier for "${field}"`)
}

/**
 * Compares two comparable values, placing nulls after non-null values.
 */
function compareValues(a: any, b: any): number {
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
 * Runs a string comparison with optional case folding.
 */
function compareText(
  itemValue: any,
  value: any,
  ignoreCase: boolean,
  compare: (left: string, right: string) => boolean,
): boolean {
  if (typeof itemValue !== 'string' || typeof value !== 'string') {
    return false
  }
  return ignoreCase
    ? compare(itemValue.toLowerCase(), value.toLowerCase())
    : compare(itemValue, value)
}
