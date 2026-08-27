import type { FieldTimestampValue } from '../hlc/index.js'
import type { FieldConflict, FieldTimestamps, MergeResult } from './types.js'
import { compareHLC, getDefaultClock, stringifyHLC } from '../hlc/index.js'
import { fieldValuesEqual } from '../utils/equality.js'

/**
 * Merge two objects at field level with Last-Writer-Wins semantics.
 */
export function mergeItemFields<T extends Record<string, any>>(
  local: T,
  remote: T,
  localTimestamps: FieldTimestamps,
  remoteTimestamps: FieldTimestamps,
): MergeResult<T> {
  const allFields = Object.keys(local)
  for (const field of Object.keys(remote)) {
    if (!Object.hasOwn(local, field))
      allFields.push(field)
  }
  let merged = local as Record<string, any>
  let mergedTimestamps = localTimestamps
  let valueChanged = false
  let timestampsChanged = false
  const conflicts: FieldConflict[] = []

  for (const field of allFields) {
    const localTs = localTimestamps[field] ?? 0
    const remoteTs = remoteTimestamps[field] ?? 0
    const order = compareHLC(localTs, remoteTs)

    const remoteWins = order < 0
    const winningValue = remoteWins ? remote[field] : local[field]
    const winningTimestamp = remoteWins ? remoteTs : localTs
    if (remoteWins && (
      !fieldValuesEqual(local[field], winningValue)
      || Object.hasOwn(local, field) !== Object.hasOwn(remote, field)
    )) {
      if (!valueChanged)
        merged = { ...local }
      merged[field] = winningValue
      valueChanged = true
    }
    if (!Object.hasOwn(localTimestamps, field) || localTimestamps[field] !== winningTimestamp) {
      if (!timestampsChanged)
        mergedTimestamps = { ...localTimestamps }
      mergedTimestamps[field] = winningTimestamp
      timestampsChanged = true
    }
    if (order === 0) {
      if (!fieldValuesEqual(local[field], remote[field])) {
        conflicts.push({
          field,
          localValue: local[field],
          remoteValue: remote[field],
          localTimestamp: localTs,
          remoteTimestamp: remoteTs,
        })
      }
    }
  }

  return { merged: merged as T, mergedTimestamps, conflicts, valueChanged, timestampsChanged }
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
 * Compute fields whose values changed between two objects.
 */
export function diffFields(oldObj: Record<string, any>, newObj: Record<string, any>): string[] {
  const changed: string[] = []
  const allFields = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const field of allFields) {
    if (!fieldValuesEqual(oldObj[field], newObj[field])) {
      changed.push(field)
    }
  }
  return changed
}
