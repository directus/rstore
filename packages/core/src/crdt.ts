/**
 * Field-level timestamps for Last-Writer-Wins (LWW) register.
 * Maps field names to the timestamp of their last modification.
 */
export type FieldTimestamps = Record<string, number>

/**
 * Describes a conflict on a single field where both local and remote
 * have different values at the same or overlapping timestamp.
 */
export interface FieldConflict {
  field: string
  localValue: any
  remoteValue: any
  localTimestamp: number
  remoteTimestamp: number
}

/**
 * Result of merging two item versions at the field level.
 */
export interface MergeResult<T extends Record<string, any> = Record<string, any>> {
  /** The merged object with the winning value for each field */
  merged: T
  /** The merged per-field timestamps */
  mergedTimestamps: FieldTimestamps
  /** Fields where both local and remote had concurrent modifications */
  conflicts: FieldConflict[]
}

/**
 * Merge two objects at the field level using LWW (Last-Writer-Wins) strategy.
 *
 * For each field present in either object:
 * - If only one side has a timestamp, that side's value is used.
 * - If both sides have timestamps, the higher timestamp wins.
 * - If timestamps are equal but values differ, it's recorded as a conflict
 *   and the local value is kept by default.
 *
 * @param local - The local version of the object
 * @param remote - The remote (incoming) version of the object
 * @param localTimestamps - Per-field timestamps for the local version
 * @param remoteTimestamps - Per-field timestamps for the remote version
 * @returns The merge result with merged data, timestamps, and any conflicts
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
    const localVal = local[field]
    const remoteVal = remote[field]

    if (remoteTs > localTs) {
      // Remote wins
      merged[field] = remoteVal
      mergedTimestamps[field] = remoteTs
    }
    else if (localTs > remoteTs) {
      // Local wins
      merged[field] = localVal
      mergedTimestamps[field] = localTs
    }
    else {
      // Same timestamp — check if values differ
      if (!fieldValuesEqual(localVal, remoteVal)) {
        conflicts.push({
          field,
          localValue: localVal,
          remoteValue: remoteVal,
          localTimestamp: localTs,
          remoteTimestamp: remoteTs,
        })
      }
      // Keep local value by default on ties
      merged[field] = localVal
      mergedTimestamps[field] = localTs
    }
  }

  return {
    merged: merged as T,
    mergedTimestamps,
    conflicts,
  }
}

/**
 * Create initial field timestamps for an object, setting all fields to the given time.
 *
 * @param data - The object whose fields to timestamp
 * @param time - The timestamp to assign (defaults to `Date.now()`)
 */
export function createFieldTimestamps(data: Record<string, any>, time = Date.now()): FieldTimestamps {
  const timestamps: FieldTimestamps = {}
  for (const field of Object.keys(data)) {
    timestamps[field] = time
  }
  return timestamps
}

/**
 * Update the timestamps for the specified fields.
 *
 * @param timestamps - Existing field timestamps
 * @param fields - The fields to update
 * @param time - The timestamp to set (defaults to `Date.now()`)
 * @returns A new timestamps object with the updated fields
 */
export function touchFields(
  timestamps: FieldTimestamps,
  fields: string[],
  time = Date.now(),
): FieldTimestamps {
  const result = { ...timestamps }
  for (const field of fields) {
    result[field] = time
  }
  return result
}

/**
 * Compute the fields that changed between two objects.
 * Returns the list of field names whose values are not equal.
 */
export function diffFields(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
): string[] {
  const changed: string[] = []
  const allFields = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const field of allFields) {
    if (!fieldValuesEqual(oldObj[field], newObj[field])) {
      changed.push(field)
    }
  }
  return changed
}

/**
 * Compare two field values for equality.
 * Handles primitives by strict equality and arrays/objects by JSON comparison.
 */
export function fieldValuesEqual(a: any, b: any): boolean {
  if (a === b)
    return true
  if (a == null && b == null)
    return true
  if (a == null || b == null)
    return false
  if (typeof a !== typeof b)
    return false
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    }
    catch {
      return false
    }
  }
  return false
}
