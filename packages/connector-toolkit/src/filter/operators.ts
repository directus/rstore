/* eslint-disable eqeqeq */

import type { FilterEvaluation } from './types'
import { supported, unsupported } from './types'

/**
 * Extra operator hook tried before the core operator switch.
 *
 * Returning `undefined` falls through to the core operators, letting
 * connectors add or override individual operators.
 */
export type ExtraOperatorEvaluator = (
  itemValue: any,
  operator: string,
  value: any,
) => FilterEvaluation | undefined

/**
 * Options accepted by {@link evaluateOperator}.
 */
export interface EvaluateOperatorOptions {
  /**
   * Connector-specific operators tried before the core switch.
   */
  extra?: ExtraOperatorEvaluator
}

/**
 * Evaluates one field operator against an item value.
 *
 * Comparisons intentionally use loose equality so numeric strings, numbers,
 * and dates coming from REST payloads compare like the remote database does.
 */
export function evaluateOperator(
  itemValue: any,
  operator: string,
  value: any,
  options: EvaluateOperatorOptions = {},
): FilterEvaluation {
  const extra = options.extra?.(itemValue, operator, value)
  if (extra !== undefined) {
    return extra
  }

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
      // `_null` takes a boolean: true matches null, false matches non-null.
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
