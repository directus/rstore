import type { FormFieldConflict, FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import { diffFields } from '@rstore/core'
import { fieldValuesEqual, pickNonSpecialProps } from '@rstore/shared'
import { mergeField } from './merge'
import { getResetInitialData, rebuildState } from './state'
import { buildUndoneSubmitOps } from './undoneEdits'

/**
 * Reset after submit while keeping edits made after submit began.
 */
export async function rebasePendingSubmitEdits<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  submittedOps: Set<FormOperation<TData>>,
  submittedBaseData: Partial<TData>,
  isCurrent: () => boolean,
) {
  const nextInitialData = await getResetInitialData(ctx)
  if (!isCurrent())
    return
  // An undo of a submitted operation leaves no inverse in the log, so it is
  // rebuilt against the acknowledged data before the log is rewritten.
  const undoneOps = buildUndoneSubmitOps(ctx, submittedOps, submittedBaseData)
  // Reset and undo can remove the submitted prefix; operation identity keeps
  // subsequent edits independent of their current position in the log.
  const rebasedFields = new Set<keyof TData>()
  const pendingOps = ctx.opLog.filter(op => !submittedOps.has(op)).map((op) => {
    const pendingOp = { ...op }
    if (pendingOp.type === 'set' && !rebasedFields.has(pendingOp.field)) {
      pendingOp.oldValue = submittedBaseData[pendingOp.field]
      rebasedFields.add(pendingOp.field)
    }
    if (ctx.relationPayloadSetOps.has(op))
      ctx.relationPayloadSetOps.add(pendingOp)
    return pendingOp
  })
  ctx.opLog.length = 0
  ctx.opLog.push(...undoneOps, ...pendingOps)
  ctx.redoStack.length = 0
  ctx.initialData = pickNonSpecialProps(submittedBaseData, true) as Partial<TData>
  rebaseForm(ctx, nextInitialData)
}

/**
 * Rebase local changes on top of new remote data.
 *
 * A field changed on both sides is merged by the field mergers (see
 * `mergeField`); without a merge it is reported in `$conflicts`.
 */
export function rebaseForm<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  newBaseData: Partial<TData>,
  explicitRemoteChangedFields?: (keyof TData)[],
) {
  const previousBaseData = ctx.initialData
  const cleanNewBase = pickNonSpecialProps(newBaseData, true) as Partial<TData>
  const explicitRemoteChangedFieldSet = explicitRemoteChangedFields
    ? new Set(explicitRemoteChangedFields.map(String))
    : null
  const remoteChangedFields = explicitRemoteChangedFields
    ? explicitRemoteChangedFields.map(String)
    : diffFields(previousBaseData as Record<string, any>, cleanNewBase as Record<string, any>)

  const localChangedFields = new Set<string>()
  for (const op of ctx.opLog) {
    if (op.type === 'set') {
      localChangedFields.add(String(op.field))
    }
  }

  const conflicts: FormFieldConflict[] = []
  const mergedFields = new Map<string, any>()
  for (const field of remoteChangedFields) {
    collectFieldConflict(ctx, {
      field,
      previousBaseData,
      cleanNewBase,
      explicitRemoteChangedFieldSet,
      localChangedFields,
      conflicts,
      mergedFields,
    })
  }

  ctx.initialData = cleanNewBase
  for (const [field, mergedValue] of mergedFields) {
    rebaseMergedFieldSetOps(ctx, field as keyof TData, (previousBaseData as any)[field], (cleanNewBase as any)[field], mergedValue)
  }

  rebuildState(ctx)
  ctx.form.$conflicts = conflicts
  if (conflicts.length > 0) {
    ctx.onConflict.trigger(conflicts as any)
  }
}

/**
 * Resolve a field conflict by choosing local or remote value.
 */
export function resolveConflict<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  field: keyof TData,
  resolution: 'local' | 'remote',
) {
  const fieldStr = String(field)
  if (resolution === 'remote') {
    for (let i = ctx.opLog.length - 1; i >= 0; i--) {
      if (String(ctx.opLog[i]!.field) === fieldStr && ctx.opLog[i]!.type === 'set') {
        ctx.opLog.splice(i, 1)
      }
    }
    rebuildState(ctx)
  }
  ctx.form.$conflicts = ctx.form.$conflicts.filter((c: FormFieldConflict) => c.field !== fieldStr)
}

/**
 * Merge one remote-changed field that also changed locally, or record its conflict.
 */
function collectFieldConflict<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  state: {
    field: string
    previousBaseData: Partial<TData>
    cleanNewBase: Partial<TData>
    explicitRemoteChangedFieldSet: Set<string> | null
    localChangedFields: Set<string>
    conflicts: FormFieldConflict[]
    mergedFields: Map<string, any>
  },
) {
  if (!state.localChangedFields.has(state.field))
    return

  const localValue = ctx.form[state.field]
  const remoteValue = (state.cleanNewBase as any)[state.field]
  const previousValue = (state.previousBaseData as any)[state.field]
  const shouldTreatAsExplicitConflict = state.explicitRemoteChangedFieldSet?.has(state.field) && previousValue === remoteValue

  if (!shouldTreatAsExplicitConflict) {
    const result = mergeField(ctx, state.field, previousValue, localValue, remoteValue)
    if (result) {
      state.mergedFields.set(state.field, result.merged)
      return
    }
  }

  if (localValue !== remoteValue) {
    state.conflicts.push({
      field: state.field,
      localValue,
      remoteValue,
    })
  }
}

/**
 * Collapse set operations for a field to match a rebased final value.
 */
function collapseFieldSetOps<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  field: keyof TData,
  nextValue: TData[keyof TData],
  baseValue: TData[keyof TData],
) {
  const fieldStr = String(field)
  const setOpIndexes: number[] = []
  let lastTimestamp = Date.now()

  for (let i = 0; i < ctx.opLog.length; i++) {
    const op = ctx.opLog[i]
    if (op && String(op.field) === fieldStr && op.type === 'set') {
      setOpIndexes.push(i)
      lastTimestamp = op.timestamp
    }
  }
  if (setOpIndexes.length === 0)
    return

  const insertAt = setOpIndexes[setOpIndexes.length - 1]! - (setOpIndexes.length - 1)
  for (let i = setOpIndexes.length - 1; i >= 0; i--) {
    ctx.opLog.splice(setOpIndexes[i]!, 1)
  }
  if (nextValue !== baseValue) {
    ctx.opLog.splice(insertAt, 0, {
      timestamp: lastTimestamp,
      field,
      type: 'set',
      newValue: nextValue,
      oldValue: baseValue,
    })
  }
}

/**
 * Preserve edit intent while rebasing the set operations of a merged field:
 * each local operation is merged against the new base on its own, so undo and
 * redo replay the rebased steps. When an operation cannot be merged or the
 * steps do not reach the merged value, the operations collapse into one.
 */
function rebaseMergedFieldSetOps<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  field: keyof TData,
  previousBaseValue: TData[keyof TData],
  nextBaseValue: TData[keyof TData],
  expectedFinalValue: TData[keyof TData],
) {
  const fieldStr = String(field)
  const setOpIndexes: number[] = []
  const rebasedOps: Array<FormOperation<TData> | null> = []
  let rebasedPreviousValue = nextBaseValue

  for (let i = 0; i < ctx.opLog.length; i++) {
    const op = ctx.opLog[i]
    if (!op || String(op.field) !== fieldStr || op.type !== 'set')
      continue
    setOpIndexes.push(i)
    const result = mergeField(ctx, fieldStr, previousBaseValue, op.newValue, nextBaseValue)
    if (!result) {
      collapseFieldSetOps(ctx, field, expectedFinalValue, nextBaseValue)
      return
    }
    const rebasedNextValue = result.merged as TData[keyof TData]
    if (fieldValuesEqual(rebasedNextValue, rebasedPreviousValue)) {
      rebasedOps.push(null)
      continue
    }
    rebasedOps.push({ ...op, oldValue: rebasedPreviousValue, newValue: rebasedNextValue })
    rebasedPreviousValue = rebasedNextValue
  }

  if (setOpIndexes.length === 0)
    return
  if (!fieldValuesEqual(rebasedPreviousValue, expectedFinalValue)) {
    collapseFieldSetOps(ctx, field, expectedFinalValue, nextBaseValue)
    return
  }
  for (let i = setOpIndexes.length - 1; i >= 0; i--) {
    const rebasedOp = rebasedOps[i]
    if (rebasedOp)
      ctx.opLog[setOpIndexes[i]!] = rebasedOp
    else
      ctx.opLog.splice(setOpIndexes[i]!, 1)
  }
}
