import type { FieldTimestampValue } from '../hlc/index.js'

/**
 * Field-level timestamps for Last-Writer-Wins registers.
 */
export type FieldTimestamps = Record<string, FieldTimestampValue>

export type { FieldTimestampValue } from '../hlc/index.js'

/**
 * Describes a field modified concurrently on two sides.
 */
export interface FieldConflict {
  field: string
  localValue: any
  remoteValue: any
  localTimestamp: FieldTimestampValue
  remoteTimestamp: FieldTimestampValue
}

/**
 * Result of merging two item versions at field level.
 */
export interface MergeResult<T extends Record<string, any> = Record<string, any>> {
  /** The merged object with winning values. */
  merged: T
  /** The merged per-field timestamps. */
  mergedTimestamps: FieldTimestamps
  /** Fields where both sides changed concurrently. */
  conflicts: FieldConflict[]
}

/**
 * A text change relative to a base string.
 */
export interface TextChange {
  index: number
  deleteCount: number
  insertText: string
}

/**
 * Overlapping text edit that cannot be merged automatically.
 */
export interface TextMergeConflict {
  index: number
  localChange: TextChange
  remoteChange: TextChange
}

/**
 * Result of merging two concurrent text values.
 */
export interface TextMergeResult {
  merged: string
  localChanges: TextChange[]
  remoteChanges: TextChange[]
  conflicts: TextMergeConflict[]
}

/**
 * Which side of inserted/replaced text a rebased cursor position sticks to.
 */
export type TextPositionAffinity = 'left' | 'right'

/**
 * Text range represented by start/end offsets.
 */
export interface TextRange {
  start: number
  end: number
}

/**
 * Options for rebasing a text range through changes.
 */
export interface RebaseTextRangeOptions {
  startAffinity?: TextPositionAffinity
  endAffinity?: TextPositionAffinity
}

/**
 * Metadata that disambiguates concurrent text inserts.
 */
export interface MergeTextOptions {
  /** HLC timestamp of the local edit. */
  localTimestamp?: FieldTimestampValue
  /** HLC timestamp of the remote edit. */
  remoteTimestamp?: FieldTimestampValue
}
