import type { FilterContext } from '@rstore/connector-toolkit'
import type { MonospaceFilterContext } from './types'

/**
 * Decimal integer text, as Monospace serializes 64-bit integers.
 */
const INTEGER_PATTERN = /^-?\d+$/

/**
 * Normalizes the values of Monospace 64-bit integer fields for cache-side
 * comparison and sorting.
 *
 * Monospace returns `int64` / `uint64` fields (listed in the generated
 * `meta.monospace.int64Fields`) as decimal strings, which would otherwise
 * compare as text (`'10' < '9'`). Decimal strings of those fields become
 * BigInt values, keeping precision beyond `Number.MAX_SAFE_INTEGER`; numbers
 * are kept as-is since JS compares BigInt and numbers by value. Other fields
 * and values are returned unchanged.
 */
export function normalizeMonospaceFieldValue(value: any, field: string, context: FilterContext): any {
  if (typeof value !== 'string' || !INTEGER_PATTERN.test(value)) {
    return value
  }
  const int64Fields = (context as MonospaceFilterContext).collection?.meta?.monospace?.int64Fields
  return int64Fields?.includes(field) ? BigInt(value) : value
}
