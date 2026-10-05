import type { FieldConflict, FieldTimestamps, FieldTimestampValue, MergeResult } from './types.js'
import { fieldValuesEqual } from '@rstore/shared'
import { compareHLC, getDefaultClock, stringifyHLC } from '../clock/index.js'

/**
 * Merge two objects at field level with Last-Writer-Wins semantics.
 */
export function mergeItemFields<T extends Record<string, any>>(
  local: T,
  remote: T,
  localTimestamps: FieldTimestamps,
  remoteTimestamps: FieldTimestamps,
): MergeResult<T> {
  const allFields = new Set([...Object.keys(local), ...Object.keys(remote)])
  const merged = {} as Record<string, any>
  const mergedTimestamps: FieldTimestamps = {}
  const conflicts: FieldConflict[] = []

  for (const field of allFields) {
    const localTs = localTimestamps[field] ?? 0
    const remoteTs = remoteTimestamps[field] ?? 0
    const order = compareHLC(localTs, remoteTs)

    if (order < 0) {
      merged[field] = remote[field]
      mergedTimestamps[field] = remoteTs
    }
    else if (order > 0) {
      merged[field] = local[field]
      mergedTimestamps[field] = localTs
    }
    else {
      if (!fieldValuesEqual(local[field], remote[field])) {
        conflicts.push({
          field,
          localValue: local[field],
          remoteValue: remote[field],
          localTimestamp: localTs,
          remoteTimestamp: remoteTs,
        })
      }
      merged[field] = local[field]
      mergedTimestamps[field] = localTs
    }
  }

  return { merged: merged as T, mergedTimestamps, conflicts }
}

/**
 * Create initial field timestamps for all fields in an object.
 */
export function createFieldTimestamps(data: Record<string, any>, time?: FieldTimestampValue): FieldTimestamps {
  const resolved = time ?? stringifyHLC(getDefaultClock().now())
  const timestamps: FieldTimestamps = {}
  for (const field of Object.keys(data)) {
    timestamps[field] = resolved
  }
  return timestamps
}

/**
 * Return a new timestamp map with selected fields touched.
 */
export function touchFields(
  timestamps: FieldTimestamps,
  fields: string[],
  time?: FieldTimestampValue,
): FieldTimestamps {
  const resolved = time ?? stringifyHLC(getDefaultClock().now())
  const result = { ...timestamps }
  for (const field of fields) {
    result[field] = resolved
  }
  return result
}

/**
 * Return the causally latest of one or more field timestamps.
 *
 * Accepts a single timestamp (HLC string or legacy number) or a per-field
 * map. Returns `null` for an empty map.
 */
export function maxStamp(
  value: FieldTimestampValue | Record<string, FieldTimestampValue>,
): FieldTimestampValue | null {
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }
  let best: FieldTimestampValue | null = null
  for (const ts of Object.values(value)) {
    if (best == null || compareHLC(ts, best) > 0) {
      best = ts
    }
  }
  return best
}
