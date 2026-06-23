import type { FormObjectBase, FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { CreateFormObjectOptions, FormObjectAdditionalProps, FormObjectChanged } from './types'
import { pickNonSpecialProps } from '@rstore/shared'
import { createEventHook } from '@vueuse/core'
import { shallowReactive } from 'vue'

export interface FormObjectRuntime<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1,
  TResult extends TData | void,
> {
  options: CreateFormObjectOptions<TData, TSchema, any, TResult>
  initialData: Partial<TData>
  onSuccess: ReturnType<typeof createEventHook<any>>
  onError: ReturnType<typeof createEventHook<any>>
  onChange: ReturnType<typeof createEventHook<any>>
  onConflict: ReturnType<typeof createEventHook<any>>
  opLog: FormOperation<TData>[]
  redoStack: FormOperation<TData>[]
  relationMethods: Record<string, any>
  form: FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData, TResult> & Record<string, any>
  proxy: any
  changeQueued: boolean
  changedSinceLastHandled: FormObjectChanged<TData>
}

/**
 * Create the mutable runtime state shared by form modules.
 */
export function createFormRuntime<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1,
  TResult extends TData | void,
>(
  options: CreateFormObjectOptions<TData, TSchema, any, TResult>,
): FormObjectRuntime<TData, TSchema, TResult> {
  return {
    options,
    initialData: pickNonSpecialProps(options.defaultValues?.() ?? {}, true) as Partial<TData>,
    onSuccess: createEventHook<any>(),
    onError: createEventHook<any>(),
    onChange: createEventHook<any>(),
    onConflict: createEventHook<any>(),
    opLog: shallowReactive<FormOperation<TData>[]>([]),
    redoStack: shallowReactive<FormOperation<TData>[]>([]),
    relationMethods: {},
    form: null as any,
    proxy: null,
    changeQueued: false,
    changedSinceLastHandled: {},
  }
}
