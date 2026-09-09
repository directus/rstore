import type { FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import { formFieldValuesEqual } from './state'
import { restoreUndoneRelationValue } from './undoSnapshots'
import { forEachRelationSourceField } from './utils/relationFields'

/**
 * Build the operations that keep an undo made during a pending submit as local
 * intent once that submit is acknowledged.
 *
 * Undo removes an operation from the op log instead of leaving an inverse in
 * it, so replaying only the remaining operations on the acknowledged data would
 * restore the value the user reverted. Undone operations are recognised by
 * identity through `ctx.undoneOps`, which survives the later edits that empty
 * the redo stack. Explicit `$reset()` and `$opLog.clear()` replace that record,
 * redo removes its own entry and remote conflict resolution never adds one, so
 * their semantics are untouched.
 *
 * @param ctx Runtime state of the form being acknowledged.
 * @param submittedOps Operations that were sent with the acknowledged submit.
 * @param submittedBaseData Form data as it was sent, used as the new base.
 */
export function buildUndoneSubmitOps<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  submittedOps: Set<FormOperation<TData>>,
  submittedBaseData: Partial<TData>,
): FormOperation<TData>[] {
  const restoredOps: FormOperation<TData>[] = []
  // Submitted operations are iterated newest first, because inverses must be
  // applied to the acknowledged data in the reverse of their recorded order.
  const submitted = [...submittedOps]
  for (let i = submitted.length - 1; i >= 0; i--) {
    const op = submitted[i]!
    if (!ctx.undoneOps.has(op))
      continue
    // Inverting an operation only restores what it recorded, so the relation
    // value the undo reverted to completes it.
    const inverseOps = restoreUndoneRelationValue(ctx, op, invertOp(ctx, op))
    if (inverseOps) {
      restoredOps.push(...inverseOps)
      continue
    }
    restoredOps.push(...restoreRelationSourceFields(ctx, op, submittedBaseData, restoredOps))
  }
  return restoredOps
}

/**
 * Return the operations reverting one operation, or `null` when the operation
 * does not carry the data needed to revert it.
 */
function invertOp<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  op: FormOperation<TData>,
): FormOperation<TData>[] | null {
  switch (op.type) {
    case 'set': {
      const inverseOp: FormOperation<TData> = {
        timestamp: op.timestamp,
        field: op.field,
        type: 'set',
        newValue: op.oldValue,
        oldValue: op.newValue,
      }
      // Direct relation payload assignment keeps its dedicated projection.
      if (ctx.relationPayloadSetOps.has(op))
        ctx.relationPayloadSetOps.add(inverseOp)
      return [inverseOp]
    }
    case 'connect':
      return [{
        timestamp: op.timestamp,
        field: op.field,
        type: 'disconnect',
        newValue: undefined,
        oldValue: op.newValue,
      }]
    case 'disconnect':
      return invertDisconnect(op)
    default:
      return null
  }
}

/**
 * Return the connect operations restoring what a disconnect removed.
 */
function invertDisconnect<TData extends Record<string, any>>(op: FormOperation<TData>): FormOperation<TData>[] | null {
  // A to-many disconnect without a target records every removed item.
  if (Array.isArray(op.oldValue)) {
    return op.oldValue.map(item => ({
      timestamp: op.timestamp,
      field: op.field,
      type: 'connect' as const,
      newValue: item,
      oldValue: undefined,
    }))
  }
  if (op.oldValue && typeof op.oldValue === 'object') {
    return [{
      timestamp: op.timestamp,
      field: op.field,
      type: 'connect',
      newValue: op.oldValue,
      oldValue: undefined,
    }]
  }
  // A to-one disconnect does not record the item it removed.
  return null
}

/**
 * Restore the projected fields of a relation operation that cannot be
 * reverted as a relation operation, by comparing what the user sees with the
 * data the acknowledged submit sent.
 */
function restoreRelationSourceFields<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  op: FormOperation<TData>,
  submittedBaseData: Partial<TData>,
  restoredOps: FormOperation<TData>[],
): FormOperation<TData>[] {
  const relation = ctx.options.collection
    ? (ctx.options.collection.normalizedRelations as Record<string, any>)[String(op.field)]
    : undefined
  if (!relation || relation.many)
    return []

  const sourceOps: FormOperation<TData>[] = []
  forEachRelationSourceField(relation, (field) => {
    const restoresField = (candidate: FormOperation<TData>) => String(candidate.field) === field
    if (sourceOps.some(restoresField) || restoredOps.some(restoresField))
      return
    const currentValue = ctx.form[field]
    const submittedValue = (submittedBaseData as Record<string, any>)[field]
    if (formFieldValuesEqual(currentValue, submittedValue))
      return
    sourceOps.push({
      timestamp: op.timestamp,
      field: field as keyof TData,
      type: 'set',
      newValue: currentValue,
      oldValue: submittedValue,
    })
  })
  return sourceOps
}
