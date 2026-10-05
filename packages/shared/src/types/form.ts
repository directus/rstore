import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ResolvedCollection } from './collection'

export interface FormObjectBase<
  TResult,
  TSchema extends StandardSchemaV1,
> {
  /**
   * @deprecated Use `$submit` instead
   */
  $save: () => Promise<TResult>
  $submit: () => Promise<TResult>
  $reset: () => Promise<void>
  $schema: TSchema
  $valid: boolean
  $error: Error | null
  $loading: boolean
}

/**
 * A field changed both locally and remotely that no field merger could
 * merge during `$rebase`. The form keeps the local value until it is resolved.
 */
export interface FormFieldConflict {
  field: string
  localValue: unknown
  remoteValue: unknown
}

/**
 * Input of a form field merger (`formFieldMerge` hook or the standalone
 * `fieldMerge` form option), called during `$rebase` for a field changed both
 * locally and remotely, and once per local `set` operation of that field when
 * the operation log is rewritten.
 */
export interface FormFieldMergePayload {
  /** Collection of a store-backed form. */
  collection?: ResolvedCollection
  /** Name of the field. */
  field: string
  /** Value both sides started from (the previous base). */
  base: unknown
  /** Local value (the form value, or the value set by one local operation). */
  local: unknown
  /** Incoming remote value (the new base). */
  remote: unknown
  /** Provide the merged value. Without a call, the field conflicts. */
  setMerged: (value: unknown) => void
}
