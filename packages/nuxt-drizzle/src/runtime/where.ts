import type { RstoreDrizzleCondition } from './utils/types'
import { likeMatch } from './utils/like'

/**
 * Drizzle JSON-mode columns (e.g. `text({ mode: 'json' })`) are stored as
 * JSON-encoded text in SQL but parsed back to arrays/objects in the client
 * cache. LIKE patterns are typically authored against the SQL representation
 * (`'%"tag"%'` to find a string in a JSON array), so re-encode array/object
 * field values before regex matching to keep cache and server filters
 * consistent. Strings, numbers, booleans, null, and undefined are returned
 * untouched.
 */
function coerceForLike(value: any): any {
  if (value == null) {
    return value
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value
}

export function filterWhere(
  item: any,
  condition: RstoreDrizzleCondition,
  dialect: string,
): boolean {
  if (condition == null) {
    return true
  }
  if ('operator' in condition) {
    switch (condition.operator) {
      case 'and':
        return condition.conditions.every(c => filterWhere(item, c, dialect))
      case 'or':
        return condition.conditions.some(c => filterWhere(item, c, dialect))
      case 'not':
        return !filterWhere(item, condition.condition, dialect)
      case 'isNull':
        return item[condition.field] == null
      case 'isNotNull':
        return item[condition.field] != null
      case 'eq':
        return item[condition.field] === condition.value
      case 'ne':
        return item[condition.field] !== condition.value
      case 'gt':
        return item[condition.field] > condition.value
      case 'lt':
        return item[condition.field] < condition.value
      case 'gte':
        return item[condition.field] >= condition.value
      case 'lte':
        return item[condition.field] <= condition.value
      case 'between':
        return item[condition.field] >= condition.value1 && item[condition.field] <= condition.value2
      case 'notBetween':
        return item[condition.field] < condition.value1 || item[condition.field] > condition.value2
      case 'inArray':
        return condition.value.includes(item[condition.field])
      case 'notInArray':
        return !condition.value.includes(item[condition.field])
      // LIKE patterns are matched with `likeMatch` (never a RegExp) so
      // client-supplied patterns cannot inject regex metacharacters (ReDoS)
      // and the match is anchored to the whole string like SQL LIKE.
      // SQLite's LIKE is case-insensitive for ASCII by default.
      case 'like':
        return likeMatch(condition.value, coerceForLike(item[condition.field]), dialect === 'sqlite')
      case 'notLike':
        return !likeMatch(condition.value, coerceForLike(item[condition.field]), dialect === 'sqlite')
      case 'ilike':
        return likeMatch(condition.value, coerceForLike(item[condition.field]), true)
      case 'notIlike':
        return !likeMatch(condition.value, coerceForLike(item[condition.field]), true)
      case 'arrayContains':
        return Array.isArray(item[condition.field]) && item[condition.field].includes(condition.value)
      case 'arrayContained':
        return Array.isArray(condition.value) && condition.value.includes(item[condition.field])
      case 'arrayOverlaps':
        return Array.isArray(item[condition.field]) && Array.isArray(condition.value) && item[condition.field].some((v: any) => condition.value.includes(v))
      default:
        // `as any` because `condition` type is `never` in this case
        throw new Error(`Unknown operator: ${(condition as any).operator}`)
    }
  }
  throw new Error('Invalid condition')
}
