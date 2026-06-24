import type { FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import type { FormObjectChanged } from './types'
import { isPublicKey, pickNonSpecialProps } from '@rstore/shared'
import { nextTick } from 'vue'
import { optimizeOpLog } from './opLog'
import { applyOp } from './projection'

/**
 * Return whether a relation field still contains rstore's internal method facade.
 */
export function isInternalRelationMethodField<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  key: string,
) {
  return !!ctx.options.collection
    && key in (ctx.options.collection.normalizedRelations as Record<string, any>)
    && ctx.form[key] === ctx.relationMethods[key]
}

/**
 * Initialize relation data fields on a target object.
 */
export function initRelationData<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  target: Record<string, any>,
  restoreMethods = true,
) {
  if (!ctx.options.collection)
    return
  for (const [rKey, rel] of Object.entries(ctx.options.collection.normalizedRelations)) {
    const initialRelData = ctx.initialData[rKey as keyof typeof ctx.initialData]
    target[`_$${rKey}Data`] = initialRelData
      ? (Array.isArray(initialRelData) ? [...initialRelData as any[]] : initialRelData)
      : (rel.many ? [] : null)
    if (restoreMethods) {
      target[rKey] = ctx.relationMethods[rKey]
    }
  }
}

/**
 * Load base data used by `$reset()`.
 */
export async function getResetInitialData<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
) {
  if (ctx.options.resetDefaultValues) {
    return pickNonSpecialProps(await ctx.options.resetDefaultValues(), true) as Partial<TData>
  }
  if (ctx.options.defaultValues) {
    return pickNonSpecialProps(ctx.options.defaultValues(), true) as Partial<TData>
  }
  return pickNonSpecialProps(ctx.initialData, true) as Partial<TData>
}

/**
 * Pick data fields from a form object without private form state or relation
 * method fields.
 */
export function pickFormData<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  clone = false,
): Partial<TData> {
  const data: Record<string, any> = {}

  for (const key in ctx.form) {
    if (!isPublicKey(key) || isInternalRelationMethodField(ctx, key))
      continue
    data[key] = ctx.form[key]
  }

  return pickNonSpecialProps(data, clone) as Partial<TData>
}

/**
 * Remove private form state and relation method fields from data leaving the form.
 */
export function removeInternalRelationData<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  data: Partial<TData>,
) {
  for (const key of Object.keys(data)) {
    if (!isPublicKey(key) || (isInternalRelationMethodField(ctx, key) && (data as any)[key] === ctx.relationMethods[key])) {
      delete (data as any)[key]
    }
  }
}

/**
 * Queue change notification and validation for the next tick.
 */
export function queueChange<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
) {
  if (ctx.changeQueued)
    return
  ctx.changeQueued = true
  nextTick(async () => {
    ctx.changeQueued = false
    ctx.onChange.trigger(ctx.changedSinceLastHandled)
    ctx.changedSinceLastHandled = {}
    const { issues } = await ctx.form.$schema['~standard'].validate(pickFormData(ctx))
    ctx.form.$valid = !issues
  })
}

/**
 * Recompute `$changedProps` from projected state and op log.
 */
export function updateChangedProps<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
) {
  const changed: FormObjectChanged<TData> = {}
  const relationKeys = ctx.options.collection
    ? new Set(Object.keys(ctx.options.collection.normalizedRelations))
    : undefined

  for (const key in ctx.initialData) {
    if (relationKeys?.has(key))
      continue
    const current = ctx.form[key]
    const initial = ctx.initialData[key]
    if (current !== initial) {
      changed[key as keyof TData] = [current, initial] as [TData[keyof TData], TData[keyof TData]]
    }
  }

  for (const op of ctx.opLog) {
    if (op.type !== 'set')
      continue
    const key = String(op.field)
    if ((!relationKeys?.has(key) && key in (ctx.initialData as Record<string, any>)) || key in changed)
      continue
    const current = ctx.form[key]
    if (current !== undefined) {
      changed[key as keyof TData] = [current, undefined] as [TData[keyof TData], TData[keyof TData]]
    }
  }
  ctx.form.$changedProps = changed
}

/**
 * Replace projected form state with current base and queued operations.
 */
export function rebuildState<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
) {
  for (const key in ctx.form) {
    if (isPublicKey(key)) {
      delete ctx.form[key]
    }
  }
  Object.assign(ctx.form, ctx.initialData)
  initRelationData(ctx, ctx.form)
  for (const op of ctx.opLog) {
    applyOp(ctx.form, op, ctx.options.collection)
  }
  updateChangedProps(ctx)
  ctx.changedSinceLastHandled = { ...ctx.form.$changedProps }
  queueChange(ctx)
}

/**
 * Rebuild state after resetting the base data.
 */
export function rebuildFormFromBase<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
) {
  ctx.form.$changedProps = {}
  ctx.form.$conflicts = []
  for (const key in ctx.form) {
    if (isPublicKey(key)) {
      delete ctx.form[key]
    }
  }
  Object.assign(ctx.form, ctx.initialData)
  initRelationData(ctx, ctx.form)
  queueChange(ctx)
}

/**
 * Record an operation and apply it to the projected state.
 */
export function recordAndApplyOp<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  opData: Omit<FormOperation<TData>, 'timestamp'>,
) {
  const op: FormOperation<TData> = { ...opData, timestamp: Date.now() }
  ctx.opLog.push(op)
  ctx.redoStack.length = 0
  applyOp(ctx.form, op, ctx.options.collection)
  updateChangedProps(ctx)
  ctx.changedSinceLastHandled = { ...ctx.form.$changedProps }
  queueChange(ctx)
}

/**
 * Create the public op-log API bound to a runtime context.
 */
export function createOpLogApi<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
) {
  return {
    getAll: (): FormOperation<TData>[] => [...ctx.opLog],
    getOptimized: (): FormOperation<TData>[] => optimizeOpLog([...ctx.opLog], ctx.options.collection),
    getFieldOps: (field: keyof TData): FormOperation<TData>[] => ctx.opLog.filter(op => op.field === field),
    getOpsBy: (filter: (operation: FormOperation<TData>) => boolean): FormOperation<TData>[] => ctx.opLog.filter(filter),
    getLastFieldOp: (field: keyof TData): FormOperation<TData> | undefined => {
      for (let i = ctx.opLog.length - 1; i >= 0; i--) {
        const op = ctx.opLog[i]
        if (op && op.field === field)
          return op
      }
      return undefined
    },
    hasFieldChanged: (field: keyof TData): boolean => ctx.opLog.some(op => op.field === field),
    getOpsInRange: (startTime: number, endTime: number): FormOperation<TData>[] =>
      ctx.opLog.filter(op => op.timestamp >= startTime && op.timestamp <= endTime),
    clear: (): void => {
      ctx.opLog.length = 0
      ctx.redoStack.length = 0
      ctx.form.$changedProps = {}
    },
    undo: (): boolean => {
      if (ctx.opLog.length === 0)
        return false
      ctx.redoStack.push(ctx.opLog.pop()!)
      rebuildState(ctx)
      return true
    },
    redo: (): boolean => {
      if (ctx.redoStack.length === 0)
        return false
      ctx.opLog.push(ctx.redoStack.pop()!)
      rebuildState(ctx)
      return true
    },
    get canUndo(): boolean {
      return ctx.opLog.length > 0
    },
    get canRedo(): boolean {
      return ctx.redoStack.length > 0
    },
    stateAt: (index: number): Partial<TData> => {
      const state: Record<string, any> = { ...(ctx.initialData as TData) }
      initRelationData(ctx, state, false)
      const count = Math.min(index, ctx.opLog.length)
      for (let i = 0; i < count; i++) {
        applyOp(state, ctx.opLog[i]!, ctx.options.collection)
      }
      return state as Partial<TData>
    },
  }
}
