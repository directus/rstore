import type { StandardSchemaV1 } from '@standard-schema/spec'

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
