/** JSON accepted for actions; never projected inspector values. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
/** Maximum encoded action envelope bytes. */
export const MAX_ACTION_BYTES = 32 * 1024
/** Maximum depth and visited entries for action envelopes. */
export const MAX_ACTION_DEPTH = 10
/** Maximum visited entries for action envelopes. */
export const MAX_ACTION_ENTRIES = 1000
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor', '$rstorePreview'])
const previewFields: Record<string, string> = {
  object: 'entries',
  array: 'values',
  date: 'value',
  map: 'entries',
  set: 'values',
  bigint: 'value',
  function: 'value',
  error: 'message',
  reference: 'path',
  accessor: 'reason',
  unsupported: 'reason',
  truncated: 'reason',
}

/** Limits shared by defensive JSON transport and action validation. */
export interface JsonValidationOptions {
  /** Total encoded UTF-8 JSON budget. */
  maxBytes: number
  /** Maximum traversed object/array depth. */
  maxDepth: number
  /** Maximum visited scalar/container count. */
  maxEntries: number
  /** Reject diagnostic preview shapes at action input boundary. */
  rejectPreviews?: boolean
  /** Omit undefined object properties like JSON.stringify for in-memory DTOs. */
  omitUndefinedProperties?: boolean
}

/** Check bounded JSON using lazy property descriptors; never execute accessors. */
export function isBoundedJson(value: unknown, options: JsonValidationOptions): boolean {
  let bytes = 0
  let entries = 0
  const visited = new WeakSet<object>()
  const encoder = new TextEncoder()
  /** Count a bounded scalar JSON encoding. */
  const addScalar = (scalar: string | number | boolean | null): boolean => {
    if (typeof scalar === 'string' && scalar.length > options.maxBytes)
      return false
    bytes += encoder.encode(JSON.stringify(scalar)).byteLength
    return bytes <= options.maxBytes
  }
  /** Visit exact descriptors; hostile proxy errors become invalid input. */
  const visit = (input: unknown, depth: number): boolean => {
    if (++entries > options.maxEntries || depth > options.maxDepth)
      return false
    if (input === null || typeof input === 'string' || typeof input === 'boolean')
      return addScalar(input)
    if (typeof input === 'number')
      return Number.isFinite(input) && addScalar(input)
    if (typeof input !== 'object' || visited.has(input))
      return false
    visited.add(input)
    const array = Array.isArray(input)
    if (!array && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
      return false
    const keys = Reflect.ownKeys(input).filter(key => !(array && key === 'length'))
    if (keys.length > options.maxEntries || keys.some(key => typeof key !== 'string'))
      return false
    if (options.rejectPreviews) {
      const kind = Object.getOwnPropertyDescriptor(input, 'kind')
      const previewField = kind && 'value' in kind && typeof kind.value === 'string' ? previewFields[kind.value] : undefined
      if (previewField && Object.getOwnPropertyDescriptor(input, previewField))
        return false
    }
    if (array && keys.length !== Object.getOwnPropertyDescriptor(input, 'length')?.value)
      return false
    bytes += 2
    if (bytes > options.maxBytes)
      return false
    let emitted = 0
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]! as string
      const descriptor = Object.getOwnPropertyDescriptor(input, key)
      if (!descriptor)
        return false
      if (forbiddenKeys.has(key) || !descriptor.enumerable || !('value' in descriptor))
        return false
      if (!array && descriptor.value === undefined && options.omitUndefinedProperties)
        continue
      if (emitted++)
        bytes++
      if (array) {
        if (key !== String(index))
          return false
      }
      else {
        if (!addScalar(key))
          return false
        bytes++
      }
      if (!visit(descriptor.value, depth + 1))
        return false
    }
    visited.delete(input)
    return bytes <= options.maxBytes
  }
  try {
    return visit(value, 0)
  }
  catch {
    return false
  }
}

/** Reject executable, unsafe, preview, and over-budget action envelopes. */
export function isActionJson(value: unknown): value is JsonValue {
  return isBoundedJson(value, { maxBytes: MAX_ACTION_BYTES, maxDepth: MAX_ACTION_DEPTH, maxEntries: MAX_ACTION_ENTRIES, rejectPreviews: true })
}
