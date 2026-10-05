/**
 * Clock, LWW, text and tombstone helpers moved to `@rstore/multiplayer`.
 *
 * Re-exported for one minor (0.9.x) so nightly consumers keep working. Each
 * value is the very object exported by `@rstore/multiplayer` (no wrapper, no
 * duplicated implementation). This file and the dependency are removed in 0.10.
 */

import * as clock from '@rstore/multiplayer/clock'
import * as lww from '@rstore/multiplayer/lww'
import * as text from '@rstore/multiplayer/text'

/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const DEFAULT_MAX_CLOCK_SKEW_MS = clock.DEFAULT_MAX_CLOCK_SKEW_MS
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const HLCClockSkewError = clock.HLCClockSkewError
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
// Classes need the instance type beside the constructor value.
// eslint-disable-next-line ts/no-redeclare
export type HLCClockSkewError = clock.HLCClockSkewError
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const HybridLogicalClock = clock.HybridLogicalClock
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
// Classes need the instance type beside the constructor value.
// eslint-disable-next-line ts/no-redeclare
export type HybridLogicalClock = clock.HybridLogicalClock
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const compareHLC = clock.compareHLC
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const createHLCClock = clock.createHLCClock
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const getDefaultClock = clock.getDefaultClock
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const parseHLC = clock.parseHLC
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const setDefaultClock = clock.setDefaultClock
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export const stringifyHLC = clock.stringifyHLC
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export type FieldTimestampValue = clock.FieldTimestampValue
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export type HLCClockSkewInfo = clock.HLCClockSkewInfo
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export type HLCString = clock.HLCString
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export type HLCTimestamp = clock.HLCTimestamp
/** @deprecated Import from `@rstore/multiplayer/clock`. Removed in 0.10. */
export type HybridLogicalClockOptions = clock.HybridLogicalClockOptions
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const createFieldTimestamps = lww.createFieldTimestamps
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const createTombstoneStore = lww.createTombstoneStore
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const gcTombstones = lww.gcTombstones
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const isTombstone = lww.isTombstone
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const mergeItemFields = lww.mergeItemFields
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const scheduleTombstoneGc = lww.scheduleTombstoneGc
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const shouldResurrect = lww.shouldResurrect
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const tombstoneKey = lww.tombstoneKey
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export const touchFields = lww.touchFields
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export type FieldConflict = lww.FieldConflict
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export type FieldTimestamps = lww.FieldTimestamps
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export type ScheduleTombstoneGcOptions = lww.ScheduleTombstoneGcOptions
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export type Tombstone = lww.Tombstone
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export type TombstoneGcSweepInfo = lww.TombstoneGcSweepInfo
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export type TombstoneStore = lww.TombstoneStore
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export const applyTextChanges = text.applyTextChanges
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export const diffText = text.diffText
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export const mergeText = text.mergeText
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export const rebaseTextPosition = text.rebaseTextPosition
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export const rebaseTextRange = text.rebaseTextRange
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export type MergeTextOptions = text.MergeTextOptions
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export type RebaseTextRangeOptions = text.RebaseTextRangeOptions
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export type TextChange = text.TextChange
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export type TextMergeConflict = text.TextMergeConflict
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export type TextMergeResult = text.TextMergeResult
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export type TextPositionAffinity = text.TextPositionAffinity
/** @deprecated Import from `@rstore/multiplayer/text`. Removed in 0.10. */
export type TextRange = text.TextRange
/** @deprecated Import from `@rstore/multiplayer/lww`. Removed in 0.10. */
export type MergeResult<T extends Record<string, any> = Record<string, any>> = lww.MergeResult<T>
