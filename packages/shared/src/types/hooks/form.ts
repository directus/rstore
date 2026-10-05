import type { CollectionDefaults, StoreSchema } from '../collection'
import type { FormFieldMergePayload } from '../form'
import type { GlobalStoreType } from '../global'

/**
 * Form hooks.
 */
export interface FormHookDefinitions<
  _TSchema extends StoreSchema,
  _TCollectionDefaults extends CollectionDefaults,
> {
  /**
   * Merge a field changed both locally and remotely during a form `$rebase`.
   * Called for the field, then for each local `set` operation on it when the
   * operation log is rewritten. Handlers run in order; the first one that calls
   * `setMerged` wins and later handlers are not called. With none, the field
   * is reported in `$conflicts`. Must be synchronous.
   */
  formFieldMerge: (
    payload: FormFieldMergePayload & {
      store: GlobalStoreType
    },
  ) => void
}
