import type { FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import type { FormObjectChanged } from './types'
import { fieldValuesEqual } from '@rstore/core'
import { isPublicKey, pickNonSpecialProps } from '@rstore/shared'
import { nextTick, toRaw } from 'vue'
import { applyOp } from './projection'
import { createRelationPayloadField, getInitialRelationData, getRelationPayloadField, pickRelationPayload } from './utils/relationPayload'

/** Options for replaying form operations into runtime state. */
interface ApplyRuntimeOpOptions { attachRelationApi?: boolean }

/**
 * Compare form field values after unwrapping Vue proxies.
 */
export function formFieldValuesEqual(a: any, b: any): boolean {
  return fieldValuesEqual(toRaw(a), toRaw(b))
}

/**
 * Return whether a key is a configured relation field.
 */
export function isRelationField<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  key: string,
) {
  return !!ctx.options.collection && key in (ctx.options.collection.normalizedRelations as Record<string, any>)
}

/**
 * Pick the user-owned payload from a relation field value.
 */
export function pickRelationRawPayload(value: unknown, clone = false, force = false): Record<string, any> | any[] | undefined {
  return pickRelationPayload(value, { clone, force })
}

/**
 * Read a backing form field without resolving proxy-only relation facades.
 */
export function getRawFormValue<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  key: PropertyKey,
) {
  if (typeof key === 'string' && isRelationField(ctx, key))
    return getRelationPayloadField(ctx.form[key])
  return ctx.form[key as keyof typeof ctx.form]
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
    const initialValue = ctx.initialData[rKey as keyof typeof ctx.initialData]
    target[`_$${rKey}Data`] = getInitialRelationData(rel)
    if (restoreMethods) {
      target[rKey] = createRelationPayloadField(ctx.relationMethods[rKey], initialValue)
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
    if (!isPublicKey(key))
      continue
    if (isRelationField(ctx, key)) {
      const relationPayload = pickRelationRawPayload(ctx.form[key], clone)
      if (relationPayload) {
        data[key] = relationPayload
      }
      continue
    }
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
): Partial<TData> {
  const cleanData: Record<string, any> = {}
  for (const key of Object.keys(data)) {
    if (!isPublicKey(key))
      continue

    const value = (data as any)[key]
    if (isRelationField(ctx, key)) {
      const hasLivePayload = !!pickRelationRawPayload(ctx.form[key])
      const isLiveRelationField = value === ctx.form[key]
      const forcePayloadPick = !isLiveRelationField || hasLivePayload || (Array.isArray(value) && value.length === 0)
      const relationPayload = pickRelationRawPayload(value, true, forcePayloadPick)
      if (relationPayload)
        cleanData[key] = relationPayload
      continue
    }
    cleanData[key] = value
  }
  return cleanData as Partial<TData>
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
    if (relationKeys?.has(key)) {
      const current = pickRelationRawPayload(ctx.form[key])
      const initial = pickRelationRawPayload(ctx.initialData[key as keyof typeof ctx.initialData], false, true)
      if (!formFieldValuesEqual(current, initial)) {
        changed[key as keyof TData] = [current, initial] as [TData[keyof TData], TData[keyof TData]]
      }
      continue
    }
    const current = ctx.form[key]
    const initial = ctx.initialData[key]
    if (!formFieldValuesEqual(current, initial)) {
      changed[key as keyof TData] = [current, initial] as [TData[keyof TData], TData[keyof TData]]
    }
  }

  for (const op of ctx.opLog) {
    if (op.type !== 'set')
      continue
    const key = String(op.field)
    const isRelationKey = !!relationKeys?.has(key)
    if ((!isRelationKey && key in (ctx.initialData as Record<string, any>)) || key in changed)
      continue
    const current = isRelationKey
      ? pickRelationRawPayload(ctx.form[key])
      : ctx.form[key]
    if (current !== undefined) {
      const initial = isRelationKey
        ? pickRelationRawPayload(ctx.initialData[key as keyof typeof ctx.initialData], false, true)
        : undefined
      changed[key as keyof TData] = [current, initial] as [TData[keyof TData], TData[keyof TData]]
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
    applyRuntimeOp(ctx, ctx.form, op)
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
export function recordAndApplyOp<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(ctx: FormObjectRuntime<TData, TSchema, TResult>, opData: Omit<FormOperation<TData>, 'timestamp'>) {
  const op: FormOperation<TData> = { ...opData, timestamp: Date.now() }
  ctx.opLog.push(op)
  ctx.redoStack.length = 0
  applyRuntimeOp(ctx, ctx.form, op)
  updateChangedProps(ctx)
  ctx.changedSinceLastHandled = { ...ctx.form.$changedProps }
  queueChange(ctx)
}

/**
 * Return a public copy of one operation with internal relation APIs stripped.
 */
export function snapshotFormOperation<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(ctx: FormObjectRuntime<TData, TSchema, TResult>, op: FormOperation<TData>): FormOperation<TData> {
  const field = String(op.field)
  if (op.type === 'set' && ctx.relationPayloadSetOps.has(op) && isRelationField(ctx, field)) {
    return {
      ...op,
      newValue: pickRelationRawPayload(op.newValue, true, true),
      oldValue: pickRelationRawPayload(op.oldValue, true, true),
    }
  }
  return { ...op }
}

/**
 * Return public operation copies for submit callbacks and op-log reads.
 */
export function snapshotFormOperations<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(ctx: FormObjectRuntime<TData, TSchema, TResult>, operations: FormOperation<TData>[] = ctx.opLog): FormOperation<TData>[] {
  return operations.map(op => snapshotFormOperation(ctx, op))
}

/**
 * Apply an operation while preserving direct relation-payload assignments.
 */
export function applyRuntimeOp<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  target: Record<string, any>,
  op: FormOperation<TData>,
  options: ApplyRuntimeOpOptions = {},
) {
  const field = String(op.field)
  if (op.type === 'set' && ctx.relationPayloadSetOps.has(op) && isRelationField(ctx, field)) {
    if (options.attachRelationApi === false) {
      target[field] = pickRelationRawPayload(op.newValue, true, true)
      return
    }
    const relationField = createRelationPayloadField(ctx.relationMethods[field], op.newValue)
    target[field] = relationField
    op.newValue = relationField
    return
  }
  applyOp(target, op, ctx.options.collection)
}
