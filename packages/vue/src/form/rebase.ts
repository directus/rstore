import type { FieldConflict, FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import { diffFields, mergeText } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { getResetInitialData, rebuildState } from './state'

/**
 * Reset after submit while keeping edits made after submit began.
 */
export async function rebasePendingSubmitEdits<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  submittedOpCount: number,
  submittedBaseData: Partial<TData>,
) {
  const nextInitialData = await getResetInitialData(ctx)
  const pendingOps = ctx.opLog.slice(submittedOpCount).map(op => ({ ...op }))
  ctx.opLog.length = 0
  ctx.opLog.push(...pendingOps)
  ctx.redoStack.length = 0
  ctx.initialData = pickNonSpecialProps(submittedBaseData, true) as Partial<TData>
  rebaseForm(ctx, nextInitialData)
}

/**
 * Rebase local changes on top of new remote data.
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

  const conflicts: FieldConflict[] = []
  const mergedTextFields = new Map<string, any>()
  const now = Date.now()
  for (const field of remoteChangedFields) {
    collectFieldConflict(ctx, {
      field,
      previousBaseData,
      cleanNewBase,
      explicitRemoteChangedFieldSet,
      localChangedFields,
      conflicts,
      mergedTextFields,
      now,
    })
  }

  ctx.initialData = cleanNewBase
  for (const [field, mergedValue] of mergedTextFields) {
    rebaseTextFieldSetOps(ctx, field as keyof TData, (previousBaseData as any)[field], (cleanNewBase as any)[field], mergedValue)
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
  ctx.form.$conflicts = ctx.form.$conflicts.filter((c: FieldConflict) => c.field !== fieldStr)
}

/**
 * Detect conflicts and text auto-merges for one remote-changed field.
 */
function collectFieldConflict<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  state: {
    field: string
    previousBaseData: Partial<TData>
    cleanNewBase: Partial<TData>
    explicitRemoteChangedFieldSet: Set<string> | null
    localChangedFields: Set<string>
    conflicts: FieldConflict[]
    mergedTextFields: Map<string, any>
    now: number
  },
) {
  if (!state.localChangedFields.has(state.field))
    return

  const localValue = ctx.form[state.field]
  const remoteValue = (state.cleanNewBase as any)[state.field]
  const previousValue = (state.previousBaseData as any)[state.field]
  const shouldTreatAsExplicitConflict = state.explicitRemoteChangedFieldSet?.has(state.field) && previousValue === remoteValue

  if (!shouldTreatAsExplicitConflict && typeof previousValue === 'string' && typeof localValue === 'string' && typeof remoteValue === 'string') {
    const mergeResult = mergeText(previousValue, localValue, remoteValue)
    if (mergeResult.conflicts.length === 0) {
      state.mergedTextFields.set(state.field, mergeResult.merged)
      return
    }
  }

  if (localValue !== remoteValue) {
    state.conflicts.push({
      field: state.field,
      localValue,
      remoteValue,
      localTimestamp: state.now,
      remoteTimestamp: state.now,
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
 * Preserve text edit intent while rebasing field set operations.
 */
function rebaseTextFieldSetOps<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  field: keyof TData,
  previousBaseValue: TData[keyof TData],
  nextBaseValue: TData[keyof TData],
  expectedFinalValue: TData[keyof TData],
) {
  if (typeof previousBaseValue !== 'string' || typeof nextBaseValue !== 'string' || typeof expectedFinalValue !== 'string') {
    collapseFieldSetOps(ctx, field, expectedFinalValue, nextBaseValue)
    return
  }

  const fieldStr = String(field)
  const setOpIndexes: number[] = []
  const rebasedOps: Array<FormOperation<TData> | null> = []
  let rebasedPreviousValue = nextBaseValue

  for (let i = 0; i < ctx.opLog.length; i++) {
    const op = ctx.opLog[i]
    if (!op || String(op.field) !== fieldStr || op.type !== 'set')
      continue
    setOpIndexes.push(i)
    if (typeof op.newValue !== 'string') {
      collapseFieldSetOps(ctx, field, expectedFinalValue, nextBaseValue)
      return
    }
    const mergeResult = mergeText(previousBaseValue, op.newValue, nextBaseValue)
    if (mergeResult.conflicts.length > 0) {
      collapseFieldSetOps(ctx, field, expectedFinalValue, nextBaseValue)
      return
    }
    const rebasedNextValue = mergeResult.merged as TData[keyof TData]
    if (rebasedNextValue === rebasedPreviousValue) {
      rebasedOps.push(null)
      continue
    }
    rebasedOps.push({ ...op, oldValue: rebasedPreviousValue, newValue: rebasedNextValue })
    rebasedPreviousValue = rebasedNextValue
  }

  if (setOpIndexes.length === 0)
    return
  if (rebasedPreviousValue !== expectedFinalValue) {
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
