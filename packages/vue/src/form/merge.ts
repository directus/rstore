import type { FormFieldMergePayload, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'

/** Result of a successful field merge. */
export interface FieldMergeResult {
  merged: unknown
}

/**
 * Ask the field mergers to merge one field changed on both sides.
 *
 * A standalone form uses its `fieldMerge` option. A store-backed form calls
 * the store's `formFieldMerge` handlers in order and stops at the first one
 * that sets a merged value. The form has no merge policy of its own.
 *
 * @returns The merged value, or `undefined` when nobody merged (a conflict).
 */
export function mergeField<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  field: string,
  base: unknown,
  local: unknown,
  remote: unknown,
): FieldMergeResult | undefined {
  let result: FieldMergeResult | undefined
  const payload: FormFieldMergePayload = {
    collection: ctx.options.collection,
    field,
    base,
    local,
    remote,
    setMerged: (value) => {
      result = { merged: value }
    },
  }
  if (ctx.options.fieldMerge) {
    ctx.options.fieldMerge(payload)
    return result
  }
  const store = ctx.options.store
  if (!store?.$hooks?.hasHook('formFieldMerge')) {
    return undefined
  }
  const storePayload = { ...payload, store }
  store.$hooks.callHookWith('formFieldMerge', (handlers) => {
    for (const { callback } of handlers) {
      callback(storePayload as any)
      if (result) {
        break
      }
    }
  })
  return result
}
