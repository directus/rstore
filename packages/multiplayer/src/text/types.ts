import type { FieldTimestampValue } from '@rstore/shared'

/**
 * Text change and merge result types. In 0.9 their definitions still live in
 * `@rstore/shared`; they move here in 0.10.
 */
export type {
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
