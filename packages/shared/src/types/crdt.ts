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
