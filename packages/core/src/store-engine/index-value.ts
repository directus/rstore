import type { CacheIndexValue } from '@rstore/shared'
import type { IndexValueId } from './internal-types.js'
import { encodeLengthPrefixedPart } from './encoding.js'

/** Encode one public scalar or exact tuple lookup. */
export function encodeIndexLookup(indexKey: string, arity: number, value: CacheIndexValue): IndexValueId {
  if (arity === 1) {
    if (Array.isArray(value))
      throw new TypeError(`Single-field index "${indexKey}" expects a scalar value`)
    return encodeValues([String(value)])
  }
  if (!Array.isArray(value))
    return encodeLegacyValue(String(value))
  return encodeValues(value.map(String))
}

/** Encode a joined-string composite lookup in a separate namespace. */
export function encodeLegacyValue(value: string): IndexValueId {
  return `l${encodeLengthPrefixedPart(value)}`
}

/** Encode scalar and tuple shape using arity plus length-prefixed values. */
export function encodeValues(values: readonly string[]): IndexValueId {
  return `${values.length === 1 ? 's' : `t${values.length}:`}${values.map(encodeLengthPrefixedPart).join('')}`
}

/** Read complete coerced index values from one item. */
export function readIndexValues(item: any, fields: readonly string[]): string[] | undefined {
  if (!item)
    return undefined
  const values: string[] = []
  for (const field of fields) {
    const raw = item[field]
    if (raw == null)
      return undefined
    values.push(String(raw))
  }
  return values
}
