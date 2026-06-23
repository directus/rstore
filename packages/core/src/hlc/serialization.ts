import type { FieldTimestampValue, HLCString, HLCTimestamp } from './types.js'

const PHYSICAL_DIGITS = 12
const LOGICAL_DIGITS = 4

/**
 * Serialize an HLC timestamp to a lexicographically-orderable string.
 */
export function stringifyHLC(ts: HLCTimestamp): HLCString {
  const physical = ts.physical.toString(16).padStart(PHYSICAL_DIGITS, '0')
  const logical = ts.logical.toString(16).padStart(LOGICAL_DIGITS, '0')
  return `${physical}:${logical}:${ts.nodeId}`
}

/**
 * Parse a serialized HLC string.
 */
export function parseHLC(str: HLCString): HLCTimestamp {
  const firstColon = str.indexOf(':')
  const secondColon = str.indexOf(':', firstColon + 1)
  if (firstColon < 0 || secondColon < 0) {
    throw new Error(`Invalid HLC string: ${str}`)
  }
  const physical = Number.parseInt(str.slice(0, firstColon), 16)
  const logical = Number.parseInt(str.slice(firstColon + 1, secondColon), 16)
  const nodeId = str.slice(secondColon + 1)
  return { physical, logical, nodeId }
}

/**
 * Coerce a legacy timestamp value into normalized HLC shape.
 */
function coerceHLC(value: FieldTimestampValue): HLCTimestamp {
  if (typeof value === 'number') {
    return { physical: value, logical: 0, nodeId: '' }
  }
  return parseHLC(value)
}

/**
 * Compare two HLC-compatible timestamp values.
 */
export function compareHLC(a: FieldTimestampValue | HLCTimestamp, b: FieldTimestampValue | HLCTimestamp): number {
  const left = typeof a === 'object' ? a : coerceHLC(a)
  const right = typeof b === 'object' ? b : coerceHLC(b)
  if (left.physical !== right.physical) {
    return left.physical - right.physical
  }
  if (left.logical !== right.logical) {
    return left.logical - right.logical
  }
  if (left.nodeId < right.nodeId)
    return -1
  if (left.nodeId > right.nodeId)
    return 1
  return 0
}
