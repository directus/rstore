import type { FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import { pickNonSpecialProps } from '@rstore/shared'
import { isRelationField } from './state'
import { itemsMatch } from './utils/items'
import { forEachRelationSourceField } from './utils/relationFields'

/**
 * Relation value an operation was reverted to by an undo.
 *
 * Whole-relation operations record local backing data, and to-one connects omit
 * the previous target. Their logs alone cannot rebuild what the user reverted
 * to. The resolved value is remembered when undo happens, detached from the
 * cache rows it came from.
 * The forward connector payload remains unchanged.
 */
export interface UndoneRelationValue {
  /** Whether the relation holds many rows. */
  many: boolean
  /** Rows the relation resolves to once the operation is undone. */
  items: Record<string, any>[]
  /** Values of the fields the relation projects onto, once it is undone. */
  sourceFields: Record<string, any>
}

/**
 * Remember the relation value an undone operation reverted to.
 *
 * Called once the undo rebuilt the form state, so the recorded value is the one
 * the user sees, resolved through the same path that answers `$value`.
 *
 * @param ctx Runtime state of the form the operation was undone on.
 * @param op Operation the undo removed from the log.
 */
export function recordUndoneRelationValue<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  op: FormOperation<TData>,
) {
  const field = String(op.field)
  // Direct relation-payload assignments keep their own projection, which the
  // resolved relation value ignores: it cannot describe what they reverted to.
  if (!isRelationField(ctx, field) || ctx.relationPayloadSetOps.has(op))
    return

  const relation = (ctx.options.collection!.normalizedRelations as Record<string, any>)[field]
  const value = ctx.relationMethods[field]?.$value
  const resolved = Array.isArray(value) ? value : value ? [value] : []
  const sourceFields: Record<string, any> = {}
  forEachRelationSourceField(relation, (name) => {
    sourceFields[name] = ctx.form[name]
  })

  ctx.undoneRelationValues.set(op, {
    many: !!relation.many,
    items: resolved.map((item: any) => pickNonSpecialProps(item, true)),
    sourceFields,
  })
}

/**
 * Extend the operations inverting an undone operation so that they restore the
 * relation value the undo reverted to, and not only the rows the operation
 * recorded.
 *
 * Returns the given operations when inverting the operation already restores
 * that value, and `null` when the caller must restore the fields the relation
 * projects onto instead.
 *
 * @param ctx Runtime state of the form being acknowledged.
 * @param op Undone operation the inverse operations were built from.
 * @param inverseOps Operations inverting `op` from its own recorded values.
 */
export function restoreUndoneRelationValue<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  op: FormOperation<TData>,
  inverseOps: FormOperation<TData>[] | null,
): FormOperation<TData>[] | null {
  const undone = ctx.undoneRelationValues.get(op)
  if (!undone || !inverseOps)
    return inverseOps
  return undone.many
    ? restoreManyRelation(op, undone, inverseOps)
    : restoreOneRelation(op, undone, inverseOps)
}

/**
 * Restore the rows of a to-many relation the inverse operations leave out.
 */
function restoreManyRelation<TData extends Record<string, any>>(
  op: FormOperation<TData>,
  undone: UndoneRelationValue,
  inverseOps: FormOperation<TData>[],
): FormOperation<TData>[] {
  if (op.type === 'connect') {
    // The row is still related without the operation, so it was already there
    // before it: disconnecting it would remove a row the undo kept.
    return undone.items.some(item => itemsMatch(item, op.newValue)) ? [] : inverseOps
  }
  // Only whole-relation operations lose rows: a targeted disconnect records the
  // one row it removed, whichever way that row was related.
  if (op.type !== 'set' && !Array.isArray(op.oldValue))
    return inverseOps

  const restored = restoredRows(inverseOps)
  // Preserve the order the undo showed, including cached rows that preceded
  // locally connected ones. Reuse recorded payloads for matching rows so a
  // partial connector item stays partial; retain unresolved recorded rows too.
  const ordered = undone.items.map(item => restored.find(row => itemsMatch(row, item)) ?? item)
  ordered.push(...restored.filter(row => !undone.items.some(item => itemsMatch(item, row))))
  if (op.type === 'set') {
    // A set inverts into a single set, which names the whole relation.
    return [{ ...inverseOps[0]!, newValue: ordered }]
  }
  return ordered.map(item => inverseOps.find(inverse => itemsMatch(inverse.newValue, item)) ?? connectOp(op, item))
}

/**
 * Restore the row a to-one relation held before an undone connect.
 */
function restoreOneRelation<TData extends Record<string, any>>(
  op: FormOperation<TData>,
  undone: UndoneRelationValue,
  inverseOps: FormOperation<TData>[],
): FormOperation<TData>[] | null {
  // Only a connect replaces a value, and its plain inverse clears the relation,
  // which drops whatever the connect replaced.
  if (op.type !== 'connect')
    return inverseOps
  const previousItem = undone.items[0]
  if (previousItem)
    return [connectOp(op, previousItem)]
  // No row resolves the relation any more; when it still projects onto a value,
  // that value carries the previous relation and is restored from the fields.
  return Object.values(undone.sourceFields).some(value => value != null) ? null : inverseOps
}

/**
 * List the rows a set of inverse operations puts back into a relation.
 */
function restoredRows<TData extends Record<string, any>>(inverseOps: FormOperation<TData>[]) {
  const rows: any[] = []
  for (const op of inverseOps) {
    if (op.type === 'connect' && op.newValue)
      rows.push(op.newValue)
    else if (op.type === 'set' && Array.isArray(op.newValue))
      rows.push(...op.newValue)
  }
  return rows
}

/**
 * Build the operation connecting one row back to the relation of an operation.
 */
function connectOp<TData extends Record<string, any>>(
  op: FormOperation<TData>,
  item: Record<string, any>,
): FormOperation<TData> {
  return {
    timestamp: op.timestamp,
    field: op.field,
    type: 'connect',
    newValue: item,
    oldValue: undefined,
  }
}
