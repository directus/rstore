/* eslint-disable eqeqeq */

import type { DirectusFilterEvaluation } from './filter-types'
import { supported, unsupported } from './filter-types'
import { comparableValue, readItemValue } from './filter-values'

/**
 * Evaluates one Directus field operator.
 */
export function evaluateOperator(itemValue: any, operator: string, value: any): DirectusFilterEvaluation {
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
      return supported(Array.isArray(value) && value.some(v => itemValue == v))
    case '_nin':
      return supported(Array.isArray(value) && !value.some(v => itemValue == v))
    case '_null':
      return supported(itemValue == null)
    case '_nnull':
      return supported(itemValue != null)
    case '_contains':
      return supported(contains(itemValue, value, false))
    case '_icontains':
      return supported(contains(itemValue, value, true))
    case '_ncontains':
      return supported(!contains(itemValue, value, false))
    case '_nicontains':
      return supported(!contains(itemValue, value, true))
    case '_starts_with':
      return supported(startsWith(itemValue, value, false))
    case '_istarts_with':
      return supported(startsWith(itemValue, value, true))
    case '_nstarts_with':
      return supported(!startsWith(itemValue, value, false))
    case '_nistarts_with':
      return supported(!startsWith(itemValue, value, true))
    case '_ends_with':
      return supported(endsWith(itemValue, value, false))
    case '_iends_with':
      return supported(endsWith(itemValue, value, true))
    case '_nends_with':
      return supported(!endsWith(itemValue, value, false))
    case '_niends_with':
      return supported(!endsWith(itemValue, value, true))
    case '_between':
      return supported(Array.isArray(value) && value.length === 2 && comparableItem >= comparableValue(value[0]) && comparableItem <= comparableValue(value[1]))
    case '_nbetween':
      return supported(Array.isArray(value) && value.length === 2 && (comparableItem < comparableValue(value[0]) || comparableItem > comparableValue(value[1])))
    case '_empty':
      return supported(!itemValue)
    case '_nempty':
      return supported(!!itemValue)
    case '_regex':
      return supported(typeof itemValue === 'string' && typeof value === 'string' && new RegExp(value).test(itemValue))
    default:
      return unsupported(`Filter operator not supported: ${operator}`)
  }
}

/**
 * Applies Directus sort expressions to an item list.
 */
export function sortItems<TItem extends Record<string, any>>(items: TItem[], sort: string | string[] | undefined): TItem[] {
  if (!sort) {
    return items
  }
  const sortFields = Array.isArray(sort) ? sort : [sort]
  return [...items].sort((a, b) => {
    for (const rawField of sortFields) {
      const desc = rawField.startsWith('-')
      const field = desc ? rawField.slice(1) : rawField
      const aValue = comparableValue(readItemValue(a, field))
      const bValue = comparableValue(readItemValue(b, field))
      if (aValue < bValue) {
        return desc ? 1 : -1
      }
      if (aValue > bValue) {
        return desc ? -1 : 1
      }
    }
    return 0
  })
}

/**
 * Applies Directus limit, offset, and page options to an item list.
 */
export function paginateItems<TItem>(items: TItem[], query: Record<string, any> | undefined): TItem[] {
  if (!query) {
    return items
  }
  const limit = typeof query.limit === 'number' ? query.limit : undefined
  const offset = typeof query.offset === 'number'
    ? query.offset
    : typeof query.page === 'number' && limit != null
      ? Math.max(0, query.page - 1) * limit
      : 0
  return limit == null ? items.slice(offset) : items.slice(offset, offset + limit)
}

/**
 * Tests string containment with optional case folding.
 */
function contains(itemValue: any, value: any, ignoreCase: boolean): boolean {
  if (Array.isArray(itemValue)) {
    return itemValue.some(item => compareText(item, value, ignoreCase))
  }
  return compareText(itemValue, value, ignoreCase)
}

/**
 * Tests whether a string starts with another string.
 */
function startsWith(itemValue: any, value: any, ignoreCase: boolean): boolean {
  if (typeof itemValue !== 'string' || typeof value !== 'string') {
    return false
  }
  const [left, right] = normalizeText(itemValue, value, ignoreCase)
  return left.startsWith(right)
}

/**
 * Tests whether a string ends with another string.
 */
function endsWith(itemValue: any, value: any, ignoreCase: boolean): boolean {
  if (typeof itemValue !== 'string' || typeof value !== 'string') {
    return false
  }
  const [left, right] = normalizeText(itemValue, value, ignoreCase)
  return left.endsWith(right)
}

/**
 * Tests whether a string contains another string.
 */
function compareText(itemValue: any, value: any, ignoreCase: boolean): boolean {
  if (typeof itemValue !== 'string' || typeof value !== 'string') {
    return false
  }
  const [left, right] = normalizeText(itemValue, value, ignoreCase)
  return left.includes(right)
}

/**
 * Normalizes two strings before text comparison.
 */
function normalizeText(left: string, right: string, ignoreCase: boolean): [string, string] {
  return ignoreCase ? [left.toLowerCase(), right.toLowerCase()] : [left, right]
}
