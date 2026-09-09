import type { FieldTimestampValue } from '@rstore/shared'

export type {
  FieldConflict,
  FieldTimestamps,
  FieldTimestampValue,
  MergeResult,
  TextChange,
  TextMergeConflict,
  TextMergeResult,
} from '@rstore/shared'

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
