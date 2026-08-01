import type { Column } from 'drizzle-orm'

/**
 * Coerces one `::`-separated key segment to the JS type its column expects.
 *
 * Keys reach the server as strings (route parameters, or `String(key)` in
 * `findMany`), but drizzle binds parameters using the column's own type — so a
 * string segment never matches a numeric or boolean primary key, and the query
 * silently affects zero rows. A segment that cannot be converted is passed
 * through unchanged rather than becoming `NaN`.
 *
 * @param column The drizzle column the segment is compared against.
 * @param segment The raw key segment.
 * @returns The segment coerced to the column's data type.
 */
export function coerceKeySegment(column: Column | undefined, segment: string | undefined) {
  if (segment == null || !column) {
    return segment
  }
  if (column.dataType === 'boolean') {
    return segment === 'true'
  }
  if (column.dataType === 'number') {
    const num = Number(segment)
    return Number.isNaN(num) ? segment : num
  }
  return segment
}
