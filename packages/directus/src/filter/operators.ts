import type { ExtraOperatorEvaluator } from '@rstore/connector-toolkit'
import type { DirectusFilterEvaluation } from './types'
import {
  normalizeSortStrings,
  evaluateOperator as toolkitEvaluateOperator,
  paginateItems as toolkitPaginateItems,
  sortItems as toolkitSortItems,
} from '@rstore/connector-toolkit'
import { supported, unsupported } from './types'
import { readItemValue } from './values'

/**
 * Directus-specific operators layered on top of the core operator set:
 * case-insensitive prefix/suffix matching, emptiness, regex, the
 * boolean-validated `_nnull` mirror, and array-aware containment.
 */
export const directusExtraOperators: ExtraOperatorEvaluator = (itemValue, operator, value) => {
  switch (operator) {
    case '_nnull':
      // `_nnull` takes a boolean: true matches non-null, false matches null.
      return typeof value === 'boolean'
        ? supported(value ? itemValue != null : itemValue == null)
        : unsupported('_nnull expects a boolean value')
    case '_contains':
      return supported(contains(itemValue, value, false))
    case '_icontains':
      return supported(contains(itemValue, value, true))
    case '_ncontains':
      return supported(!contains(itemValue, value, false))
    case '_nicontains':
      return supported(!contains(itemValue, value, true))
    case '_istarts_with':
      return supported(startsWith(itemValue, value, true))
    case '_nistarts_with':
      return supported(!startsWith(itemValue, value, true))
    case '_iends_with':
      return supported(endsWith(itemValue, value, true))
    case '_niends_with':
      return supported(!endsWith(itemValue, value, true))
    case '_empty':
      return supported(!itemValue)
    case '_nempty':
      return supported(!!itemValue)
    case '_regex':
      return supported(typeof itemValue === 'string' && typeof value === 'string' && new RegExp(value).test(itemValue))
    default:
      // Fall through to the core operator switch.
      return undefined
  }
}

/**
 * Evaluates one Directus field operator.
 */
export function evaluateOperator(itemValue: any, operator: string, value: any): DirectusFilterEvaluation {
  return toolkitEvaluateOperator(itemValue, operator, value, { extra: directusExtraOperators })
}

/**
 * Applies Directus sort expressions (`-field` for descending) to an item
 * list, reading function-parameter fields like `year(created_at)`.
 */
export function sortItems<TItem extends Record<string, any>>(items: TItem[], sort: string | string[] | undefined): TItem[] {
  return toolkitSortItems(items, normalizeSortStrings(sort), { readValue: readItemValue })
}

/**
 * Applies Directus limit, offset, and 1-based page options to an item list.
 */
export function paginateItems<TItem>(items: TItem[], query: Record<string, any> | undefined): TItem[] {
  return toolkitPaginateItems(items, query, { supportsPage: true })
}

/**
 * Tests string containment with optional case folding; array item values
 * match when any entry contains the searched string.
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
