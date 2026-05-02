import type { DirectusFilterContext, DirectusUnsupportedEvaluation } from './filter-types'
import { unsupported } from './filter-types'

/**
 * Resolved filter value that can be evaluated locally.
 */
export type ResolvedFilterValue = {
  /**
   * Whether the value was resolved successfully.
   */
  supported: true

  /**
   * Static value to use in operator comparison.
   */
  value: any
} | DirectusUnsupportedEvaluation

/**
 * Resolves Directus dynamic variables that are cache-safe.
 */
export function resolveFilterValue(
  value: any,
  context: DirectusFilterContext,
): ResolvedFilterValue {
  if (typeof value !== 'string') {
    return { supported: true, value }
  }
  if (value.startsWith('$CURRENT_') || value.startsWith('$FOLLOW')) {
    return unsupported(`Dynamic variable "${value}" requires Directus auth context`)
  }
  if (value === '$NOW') {
    return { supported: true, value: context.now ?? new Date() }
  }

  const nowMatch = /^\$NOW\(([-+]?\d+)\s+(\w+)\)$/.exec(value)
  if (!nowMatch) {
    return { supported: true, value }
  }

  const date = new Date(context.now ?? new Date())
  addDateDistance(date, Number.parseInt(nowMatch[1]!, 10), nowMatch[2]!)
  return { supported: true, value: date }
}

/**
 * Reads a raw or function-parameter field value from an item.
 */
export function readItemValue(item: Record<string, any>, key: string): any {
  const match = /^(\w+)\((.*)\)$/.exec(key)
  if (!match) {
    return item[key]
  }

  const value = item[match[2]!]
  switch (match[1]) {
    case 'year':
      return toDate(value).getFullYear()
    case 'month':
      return toDate(value).getMonth() + 1
    case 'week':
      return getWeekNumber(toDate(value))
    case 'day':
      return toDate(value).getDate()
    case 'weekday':
      return toDate(value).getDay()
    case 'hour':
      return toDate(value).getHours()
    case 'minute':
      return toDate(value).getMinutes()
    case 'second':
      return toDate(value).getSeconds()
    case 'count':
      return Array.isArray(value) ? value.length : Object.keys(value ?? {}).length
    default:
      return undefined
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
 * Adds a Directus `$NOW(<distance>)` adjustment to a date.
 */
function addDateDistance(date: Date, amount: number, unit: string): void {
  const normalizedUnit = unit.replace(/s$/, '')
  switch (normalizedUnit) {
    case 'second':
      date.setSeconds(date.getSeconds() + amount)
      break
    case 'minute':
      date.setMinutes(date.getMinutes() + amount)
      break
    case 'hour':
      date.setHours(date.getHours() + amount)
      break
    case 'day':
      date.setDate(date.getDate() + amount)
      break
    case 'month':
      date.setMonth(date.getMonth() + amount)
      break
    case 'year':
      date.setFullYear(date.getFullYear() + amount)
      break
  }
}

/**
 * Converts a value into a Date instance.
 */
function toDate(value: any): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Computes a simple week number compatible with Directus function filters.
 */
function getWeekNumber(date: Date): number {
  const startDate = new Date(date.getFullYear(), 0, 1)
  const days = Math.floor((date.valueOf() - startDate.valueOf()) / 86400000)
  return Math.ceil((days + startDate.getDay() + 1) / 7)
}
