import type { FieldConflict, FormObjectBase, FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { CreateFormObjectOptions, FormObjectAdditionalProps, FormObjectChanged, OpLogAPI, VueFormObject } from './types'
import { emptySchema } from '@rstore/core'
import { markRaw, reactive } from 'vue'
import { createFormRuntime } from './context'
import { optimizeOpLog } from './opLog'
import { rebaseForm, rebasePendingSubmitEdits, resolveConflict } from './rebase'
import { createFormProxy, installRelationMethods } from './relations'
import { createOpLogApi, getResetInitialData, pickFormData, queueChange, rebuildFormFromBase, removeInternalRelationData } from './state'

export function createFormObject<
  TData extends Record<string, any> = Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  const TAdditionalProps = Record<string, never>,
  TResult extends TData | void = TData,
>(options: CreateFormObjectOptions<TData, TSchema, TAdditionalProps, TResult>) {
  const ctx = createFormRuntime<TData, TSchema, TResult>(options)

  ctx.form = reactive({
    ...ctx.initialData as TData,
    ...options.additionalProps,
    $error: null,
    $loading: false as boolean,
    async $reset() {
      ctx.initialData = await getResetInitialData(ctx)
      ctx.opLog.length = 0
      ctx.redoStack.length = 0
      rebuildFormFromBase(ctx)
    },
    async $submit() {
      return submitForm(ctx)
    },
    $save() {
      console.warn(`$save() is deprecated, use $submit() instead`)
      return this.$submit()
    },
    $schema: markRaw(options.schema ?? emptySchema()) as TSchema,
    $valid: false as boolean,
    $changedProps: {} as FormObjectChanged<TData>,
    $hasChanges: (): boolean => Object.keys(ctx.form.$changedProps).length > 0,
    $opLog: createOpLogApi(ctx) as OpLogAPI<TData>,
    $onSuccess: ctx.onSuccess.on,
    $onError: ctx.onError.on,
    $onSaved(...args: Parameters<FormObjectAdditionalProps<TData, TResult>['$onSaved']>) {
      console.warn(`$onSaved() is deprecated, use $onSuccess() instead`)
      return this.$onSuccess(...args)
    },
    $onChange: ctx.onChange.on,
    $rebase: (newBaseData: Partial<TData>, remoteChangedFields?: (keyof TData)[]) => {
      rebaseForm(ctx, newBaseData, remoteChangedFields)
    },
    $conflicts: [] as FieldConflict[],
    $resolveConflict: (field: keyof TData, resolution: 'local' | 'remote') => {
      resolveConflict(ctx, field, resolution)
    },
    $onConflict: ctx.onConflict.on,
  } satisfies FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData, TResult>) as FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData, TResult> & Record<string, any>

  ctx.proxy = createFormProxy(ctx)
  installRelationMethods(ctx)
  queueChange(ctx)

  return ctx.proxy as VueFormObject<TData, TSchema, TAdditionalProps, TResult>
}

/**
 * Submit the form, including validation, operation optimization, and reset.
 */
async function submitForm<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: ReturnType<typeof createFormRuntime<TData, TSchema, TResult>>,
) {
  ctx.form.$loading = true
  ctx.form.$error = null
  try {
    const submittedBaseData = pickFormData(ctx, true)
    const submittedOperations = [...ctx.opLog]
    const submittedOpCount = submittedOperations.length
    const submittedFormOperations = optimizeOpLog(submittedOperations, ctx.options.collection)
    const data = ctx.options.transformData
      ? ctx.options.transformData(ctx.proxy as Partial<TData>)
      : pickFormData(ctx, true)
    removeInternalRelationData(ctx, data)

    if (ctx.options.validateOnSubmit ?? true) {
      const { issues } = await ctx.form.$schema['~standard'].validate(data)
      if (issues) {
        const error = new Error(issues.map(i => i.message).join(', '))
        ;(error as any).$issues = issues
        throw error
      }
    }

    const item = await ctx.options.submit(data, { formOperations: submittedFormOperations as FormOperation<TData>[] })
    ctx.onSuccess.trigger(item)
    if (ctx.options.resetOnSuccess ?? true) {
      await rebasePendingSubmitEdits(ctx, submittedOpCount, submittedBaseData)
    }
    return item
  }
  catch (error: any) {
    ctx.form.$error = error
    ctx.onError.trigger(error)
    throw error
  }
  finally {
    ctx.form.$loading = false
  }
}

/**
 * @deprecated Use `createFormObject` instead - all functionality was moved there.
 */
export const createFormObjectWithChangeDetection: typeof createFormObject = (...args) => {
  console.warn(`createFormObjectWithChangeDetection is deprecated, use createFormObject instead`)
  return createFormObject(...args)
}
