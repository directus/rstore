import type { FieldTimestampValue } from '../hlc/index.js'
import type { FieldTimestamps, MergeResult } from './types.js'
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
  const result: MutableMergeResult = {
    merged: local,
    mergedTimestamps: localTimestamps,
    conflicts: [],
    valueChanged: false,
    timestampsChanged: false,
  }
  for (const field in local) {
    if (Object.hasOwn(local, field))
      mergeField(local, remote, localTimestamps, remoteTimestamps, field, result)
  }
  for (const field in remote) {
    if (Object.hasOwn(remote, field) && !Object.hasOwn(local, field))
      mergeField(local, remote, localTimestamps, remoteTimestamps, field, result)
  }
  return result as MergeResult<T>
}

/** Mutable merge accumulator reused across local and remote field passes. */
interface MutableMergeResult extends MergeResult<Record<string, any>> {}

/** Merge one field into a lazily cloned result accumulator. */
function mergeField(
  local: Record<string, any>,
  remote: Record<string, any>,
  localTimestamps: FieldTimestamps,
  remoteTimestamps: FieldTimestamps,
  field: string,
  result: MutableMergeResult,
): void {
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
    if (!result.valueChanged)
      result.merged = { ...local }
    result.merged[field] = winningValue
    result.valueChanged = true
  }
  if (!Object.hasOwn(localTimestamps, field) || localTimestamps[field] !== winningTimestamp) {
    if (!result.timestampsChanged)
      result.mergedTimestamps = { ...localTimestamps }
    result.mergedTimestamps[field] = winningTimestamp
    result.timestampsChanged = true
  }
  if (order === 0 && !fieldValuesEqual(local[field], remote[field])) {
    result.conflicts.push({
      field,
      localValue: local[field],
      remoteValue: remote[field],
      localTimestamp: localTs,
      remoteTimestamp: remoteTs,
    })
  }
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
