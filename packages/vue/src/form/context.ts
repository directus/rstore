import type { FormObjectBase, FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { CreateFormObjectOptions, FormObjectAdditionalProps, FormObjectChanged } from './types'
import type { UndoneRelationValue } from './undoSnapshots'
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
  /**
   * Identities of the operations the user explicitly undid.
   *
   * A later edit empties the redo stack, so the redo stack alone cannot tell an
   * undo from an explicit reset once the user keeps typing. This weak record
   * keeps the undo intent by identity, without retaining any history: it is
   * replaced on `$reset()` and `$opLog.clear()`, and an entry is removed when
   * the operation is redone.
   */
  undoneOps: WeakSet<FormOperation<TData>>
  /**
   * Relation values the undone operations reverted to, keyed by operation
   * identity.
   *
   * Some relation operations omit previous cache-resolved values. This weak
   * record retains detached snapshots while their operations remain reachable,
   * without retaining history of its own.
   * The forward operation log remains unchanged.
   */
  undoneRelationValues: WeakMap<FormOperation<TData>, UndoneRelationValue>
  relationMethods: Record<string, any>
  /** Set operations that came from direct relation-payload assignment. */
  relationPayloadSetOps: WeakSet<object>
  form: FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData, TResult> & Record<string, any>
  proxy: any
  /** Invalidates results from validation of older form data. */
  validationId: number
  /** Latest submitted state owns public errors and acknowledgement rebasing. */
  submissionId: number
  /** All outstanding submissions contribute to loading state. */
  pendingSubmits: number
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
    undoneOps: new WeakSet<FormOperation<TData>>(),
    undoneRelationValues: new WeakMap<FormOperation<TData>, UndoneRelationValue>(),
    relationMethods: {},
    relationPayloadSetOps: new WeakSet(),
    form: null as any,
    proxy: null,
    validationId: 0,
    submissionId: 0,
    pendingSubmits: 0,
    changeQueued: false,
    changedSinceLastHandled: {},
  }
}
