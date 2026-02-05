import type { RstoreDrizzleCondition } from './utils/types'

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
      case 'like':
        // Including `%` in the pattern matches zero or more characters, and including `_` will match a single character.
        return new RegExp(condition.value.replace(/%/g, '.*').replace(/_/g, '.'), dialect === 'sqlite' ? 'i' : undefined).test(item[condition.field])
      case 'notLike':
        return !new RegExp(condition.value.replace(/%/g, '.*').replace(/_/g, '.'), dialect === 'sqlite' ? 'i' : undefined).test(item[condition.field])
      case 'ilike':
        // Including `%` in the pattern matches zero or more characters, and including `_` will match a single character.
        return new RegExp(condition.value.replace(/%/g, '.*').replace(/_/g, '.'), 'i').test(item[condition.field])
      case 'notIlike':
        return !new RegExp(condition.value.replace(/%/g, '.*').replace(/_/g, '.'), 'i').test(item[condition.field])
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
