/**
 * Field LWW types. In 0.9 their definitions still live in `@rstore/shared`
 * (so `@rstore/shared` needs no dependency on this package); they move here
 * in 0.10.
 */
export type {
  FieldConflict,
  FieldTimestamps,
  FieldTimestampValue,
  MergeResult,
} from '@rstore/shared'
