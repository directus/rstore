import type { CacheIndexValue } from '@rstore/shared'
import type { EngineIndexState, IndexedValue, IndexValueId } from './internal-types.js'

/** Read one complete indexed membership from a resolved item. */
export function readIndexedValue(item: any, fields: readonly string[], index?: EngineIndexState): IndexedValue | undefined {
  if (!item)
    return undefined
  if (fields.length === 1) {
    const raw = item[fields[0]!]
    if (raw == null)
      return undefined
    const value = String(raw)
    let indexed = index?.scalarValues.get(value)
    if (!indexed) {
      indexed = createIndexedValue([value])
      index?.scalarValues.set(value, indexed)
    }
    return indexed
  }
  if (fields.length === 2) {
    const firstRaw = item[fields[0]!]
    const secondRaw = item[fields[1]!]
    if (firstRaw == null || secondRaw == null)
      return undefined
    const first = String(firstRaw)
    const second = String(secondRaw)
    const bySecond = index?.tupleValues.get(first)
    let indexed = bySecond?.get(second)
    if (!indexed) {
      indexed = createIndexedValue([first, second])
      if (index) {
        const values = bySecond ?? new Map<string, IndexedValue>()
        index.tupleValues.set(first, values)
        values.set(second, indexed)
      }
    }
    return indexed
  }
  const values: string[] = []
  for (const field of fields) {
    const raw = item[field]
    if (raw == null)
      return undefined
    values.push(String(raw))
  }
  return createIndexedValue(values)
}

/** Encode one public scalar or exact tuple lookup. */
export function encodeIndexLookup(
  indexKey: string,
  arity: number,
  value: CacheIndexValue,
  index?: EngineIndexState,
): IndexValueId {
  if (arity === 1) {
    if (Array.isArray(value))
      throw new TypeError(`Single-field index "${indexKey}" expects a scalar value`)
    const scalar = String(value)
    return index?.scalarValues.get(scalar)?.id ?? encodeValues([scalar])
  }
  if (!Array.isArray(value))
    return encodeLegacyValue(String(value))
  if (arity === 2) {
    const first = String(value[0])
    const second = String(value[1])
    return index?.tupleValues.get(first)?.get(second)?.id ?? encodeValues([first, second])
  }
  return encodeValues(value.map(String))
}

/** Encode a joined-string composite lookup in a separate namespace. */
export function encodeLegacyValue(value: string): IndexValueId {
  return `l${encodePart(value)}`
}

/** Return only live targets for one retained legacy alias. */
export function getLiveAliasTargets(index: EngineIndexState | undefined, legacy: string): IndexValueId[] {
  const result: IndexValueId[] = []
  for (const id of index?.legacyAliases.get(legacy) ?? []) {
    if (index?.buckets.get(id)?.size)
      result.push(id)
  }
  return result
}

/** Create both exact and legacy representations for one membership. */
function createIndexedValue(values: string[]): IndexedValue {
  const legacy = values.join(':')
  return { id: encodeValues(values), legacy, legacyId: encodeLegacyValue(legacy) }
}

/** Encode scalar and tuple shape using arity plus length-prefixed values. */
function encodeValues(values: readonly string[]): IndexValueId {
  return `${values.length === 1 ? 's' : `t${values.length}:`}${values.map(encodePart).join('')}`
}

/** Length-prefix one coerced index component. */
function encodePart(value: string): string {
  return `${value.length}:${value}`
}
