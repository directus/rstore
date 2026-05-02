/**
 * A single field timestamp value. Either a legacy wall-clock number or a
 * serialized Hybrid Logical Clock string (see `@rstore/core`'s `hlc.ts`).
 *
 * HLC strings sort lexicographically in causal order, so both forms can be
 * compared with the same helper (`compareHLC`).
 */
export type FieldTimestampValue = number | string

/**
 * Field-level timestamps for Last-Writer-Wins (LWW) register.
 * Maps field names to the timestamp of their last modification.
 */
export type FieldTimestamps = Record<string, FieldTimestampValue>

/**
 * Describes a conflict on a single field where both local and remote
 * have different values at the same or overlapping timestamp.
 */
export interface FieldConflict {
  field: string
  localValue: any
  remoteValue: any
  localTimestamp: FieldTimestampValue
  remoteTimestamp: FieldTimestampValue
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
 * A text change relative to a base string.
 * Deletes `deleteCount` characters starting at `index`, then inserts `insertText`.
 */
export interface TextChange {
  index: number
  deleteCount: number
  insertText: string
}

/**
 * Describes an overlapping text edit that cannot be merged automatically.
 */
export interface TextMergeConflict {
  index: number
  localChange: TextChange
  remoteChange: TextChange
}

/**
 * Result of merging two text values edited concurrently from the same base.
 */
export interface TextMergeResult {
  merged: string
  localChanges: TextChange[]
  remoteChanges: TextChange[]
  conflicts: TextMergeConflict[]
}
