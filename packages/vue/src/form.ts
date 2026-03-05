import type { Awaitable, Cache, Collection, CollectionDefaults, CreateFormObject, FieldConflict, FormObjectBase, FormOperation, ResolvedCollection, ResolvedCollectionItem, StandardSchemaV1, StoreSchema, UpdateFormObject } from '@rstore/shared'
import type { EventHook, EventHookOn } from '@vueuse/core'
import { diffFields, emptySchema, isKeyDefined } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { createEventHook } from '@vueuse/core'
import { markRaw, nextTick, reactive, shallowReactive } from 'vue'

export type { FormOperation, FormOperationType } from '@rstore/shared'

export type OpLogFilterFn<TData extends Record<string, any> = Record<string, any>> = (operation: FormOperation<TData>) => boolean

export interface OpLogAPI<TData extends Record<string, any> = Record<string, any>> {
  /**
   * Get a copy of all operations
   */
  getAll: () => FormOperation<TData>[]
  /**
   * Get an optimized copy of operations with redundant relation operations removed.
   * For example, a connect followed by a disconnect on the same item will cancel out.
   * This is what gets passed to `submit` by default.
   */
  getOptimized: () => FormOperation<TData>[]
  /**
   * Get operations for a specific field
   */
  getFieldOps: (field: keyof TData) => FormOperation<TData>[]
  /**
   * Get operations that match a filter
   */
  getOpsBy: (filter: OpLogFilterFn<TData>) => FormOperation<TData>[]
  /**
   * Get the last operation for a field
   */
  getLastFieldOp: (field: keyof TData) => FormOperation<TData> | undefined
  /**
   * Check if a field has been changed in the op log
   */
  hasFieldChanged: (field: keyof TData) => boolean
  /**
   * Get operations between two timestamps
   */
  getOpsInRange: (startTime: number, endTime: number) => FormOperation<TData>[]
  /**
   * Clear the operation log, redo stack, and reset changed props
   */
  clear: () => void
  /**
   * Undo the last operation and rebuild state from the log.
   * Returns true if an operation was undone.
   */
  undo: () => boolean
  /**
   * Redo the last undone operation and rebuild state.
   * Returns true if an operation was redone.
   */
  redo: () => boolean
  /**
   * Whether there are operations that can be undone
   */
  readonly canUndo: boolean
  /**
   * Whether there are operations that can be redone
   */
  readonly canRedo: boolean
  /**
   * Compute a snapshot of the state at a specific operation index.
   * Index 0 returns the initial state, index N returns the state after N operations.
   */
  stateAt: (index: number) => Partial<TData>
}

export interface CreateFormObjectOptions<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1,
  TAdditionalProps,
  TResult extends TData | void = TData,
> {
  /**
   * Function returning the default values for the form
   *
   * If not provided, the form will be initialized with an empty object
   *
   * If `resetDefaultValues` is provided, `defaultValues` will only be used for the initial values
   */
  defaultValues?: (() => Partial<TData>) | undefined
  /**
   * Function returning the default values for the form when `$reset()` is called. `resetDefaultValues` is **not** called when initializing the form.
   *
   * If not provided, `defaultValues` will be used instead
   *
   * If neither `resetDefaultValues` nor `defaultValues` are provided, the form will be reset to an empty object
   */
  resetDefaultValues?: (() => Awaitable<Partial<TData>>) | undefined
  /**
   * Schema to validate the form data against. It should be compatible with Standard Schema v1.
   */
  schema?: TSchema
  /**
   * Function to transform the data before submission (e.g. to remove extra properties).
   */
  transformData?: (data: Partial<TData>) => Partial<TData>
  /**
   * Function called when the form is submitted.
   */
  submit: (data: Partial<TData>, context: { formOperations: FormOperation<TData>[] }) => Promise<TResult>
  /**
   * Additional properties to add to the form object. Their name must start with `$` to avoid conflicts with form fields.
   */
  additionalProps?: TAdditionalProps
  /**
   * Resets the form to default values after a successful submission
   * @default true
   */
  resetOnSuccess?: boolean
  /**
   * If `true`, the form will be validated using the `schema` when `$submit()` is called. If `false`, the form will not be validated automatically, and you will need to validate it manually if needed.
   * @default true
   */
  validateOnSubmit?: boolean
  /**
   * Optional collection information to enable relation field methods
   * @internal
   */
  collection?: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  /**
   * Optional store reference to enable resolving relation fields from cache
   * @internal
   */
  store?: {
    $cache: Cache
    $collections: Array<ResolvedCollection>
  }
}

export type FormObjectChanged<TData> = {
  [TKey in keyof TData]?: [
    newValue: TData[TKey],
    oldValue: TData[TKey],
  ] | undefined
}

/**
 * Relation field methods for connecting/disconnecting related items
 */
export interface RelationFieldMethods<TItem = any> {
  /**
   * The current resolved value of the relation field.
   * For one-to-one relations, this is the related item or null.
   * For many relations, this is an array of related items.
   */
  value: TItem | TItem[] | null
  /**
   * Connect a related item by its identifier(s)
   */
  connect: (item: Partial<TItem>) => void
  /**
   * Disconnect the related item(s)
   */
  disconnect: (item?: Partial<TItem>) => void
  /**
   * Set the related item(s) (for many relations)
   */
  set: (items: Array<Partial<TItem>>) => void
}

export interface FormObjectAdditionalProps<
  TData extends Record<string, any>,
  TResult extends TData | void = TData,
> {
  $changedProps: FormObjectChanged<TData>
  $hasChanges: () => boolean
  /**
   * Operation log API for querying and managing change history.
   * All edit operations (field sets, relation connects/disconnects) are recorded here.
   */
  $opLog: OpLogAPI<TData>
  /**
   * @deprecated Use `$onSuccess` instead
   */
  $onSaved: EventHookOn<TResult>
  $onSuccess: EventHookOn<TResult>
  $onError: EventHookOn<Error>
  $onChange: EventHookOn<FormObjectChanged<TData>>
  /**
   * Rebase local changes on top of new remote data.
   * Updates the initial data to `newBaseData` and replays the op log.
   * Fields modified locally that were also changed remotely are reported as conflicts.
   *
   * This is useful for collaborative editing where remote updates arrive
   * while the user is editing the form.
   *
   * @param remoteChangedFields - Optional list of field names that were explicitly changed remotely.
   *   When provided, these fields are used as the set of remote changes instead of computing them
   *   by diffing against the previous base data. This is important when a remote change sets a field
   *   back to its original value — without this hint, the diff would see no change.
   */
  $rebase: (newBaseData: Partial<TData>, remoteChangedFields?: (keyof TData)[]) => void
  /**
   * Active field-level conflicts detected during the last `$rebase`.
   * Each conflict indicates a field where both local and remote had different values.
   */
  $conflicts: FieldConflict[]
  /**
   * Resolve a conflict on a field by choosing a resolution.
   * - `'local'`: Keep the local value (default on ties)
   * - `'remote'`: Accept the remote value and discard the local op for this field
   */
  $resolveConflict: (field: keyof TData, resolution: 'local' | 'remote') => void
  /**
   * Register a callback that is called when conflicts are detected during rebase.
   */
  $onConflict: EventHookOn<FieldConflict[]>
}

type VueFormObject<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TAdditionalProps = Record<string, never>,
  TResult extends TData | void = TData,
> = FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData, TResult> & TAdditionalProps & Partial<TData> & (() => Promise<TData>)

/**
 * Object returned by `store.<Collection>.createForm()`
 */
export type VueCreateFormObject<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = CreateFormObject<TCollection, TCollectionDefaults, TSchema> & VueFormObject<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

/**
 * Object returned by `store.<Collection>.updateForm()`
 */
export type VueUpdateFormObject<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = UpdateFormObject<TCollection, TCollectionDefaults, TSchema> & VueFormObject<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

/**
 * Find the last index in an array matching a predicate.
 */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!))
      return i
  }
  return -1
}

/**
 * Check if two partial items refer to the same entity by shallow comparison.
 * Returns true if all keys of the smaller object exist in the larger object with the same values.
 */
function itemsMatch(a: any, b: any): boolean {
  if (a === b)
    return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
    return false
  if (Array.isArray(a) || Array.isArray(b))
    return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  const [checkKeys, other] = keysA.length <= keysB.length ? [keysA, b] : [keysB, a]
  return checkKeys.length > 0 && checkKeys.every(k => k in other && a[k] === other[k])
}

/**
 * Optimize a list of form operations to remove redundant work.
 *
 * Optimizations applied:
 * - For scalar fields: only the last `set` operation per field is kept.
 * - For relation fields: connect/disconnect pairs on the same item cancel out.
 * - A disconnect-all removes all prior connect/disconnect operations on that field.
 * - A `set` on a relation removes all prior operations on that field.
 * - For one-to-one relations: only the last connect is kept; connect+disconnect cancel out.
 */
export function optimizeOpLog<TData extends Record<string, any>>(
  operations: FormOperation<TData>[],
  collection?: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>,
): FormOperation<TData>[] {
  // Group operations by field
  const fieldGroups = new Map<string, FormOperation<TData>[]>()
  for (const op of operations) {
    const key = String(op.field)
    let group = fieldGroups.get(key)
    if (!group) {
      group = []
      fieldGroups.set(key, group)
    }
    group.push(op)
  }

  const result: FormOperation<TData>[] = []

  for (const [fieldName, ops] of fieldGroups) {
    const hasRelationOps = ops.some(op => op.type !== 'set')

    if (!hasRelationOps) {
      // Scalar field: keep only the last set
      result.push(ops[ops.length - 1]!)
      continue
    }

    const relation = collection
      ? (collection.normalizedRelations as Record<string, any>)[fieldName]
      : undefined
    const isMany = relation?.many ?? true // default to many-like behavior if unknown

    const pending: FormOperation<TData>[] = []

    for (const op of ops) {
      switch (op.type) {
        case 'set':
          // A set replaces all prior operations on this field
          pending.length = 0
          pending.push(op)
          break

        case 'connect':
          if (!isMany) {
            // One-to-one: cancel with prior disconnect, replace prior connect
            const discIdx = findLastIndex(pending, p => p.type === 'disconnect')
            if (discIdx !== -1) {
              pending.splice(discIdx, 1)
            }
            const priorIdx = findLastIndex(pending, p => p.type === 'connect')
            if (priorIdx !== -1) {
              pending.splice(priorIdx, 1)
            }
            pending.push(op)
          }
          else {
            // Many-relation: check for matching disconnect to cancel
            const matchIdx = pending.findIndex(p =>
              p.type === 'disconnect'
              && p.oldValue != null
              && typeof p.oldValue === 'object'
              && !Array.isArray(p.oldValue)
              && itemsMatch(p.oldValue, op.newValue),
            )
            if (matchIdx !== -1) {
              pending.splice(matchIdx, 1)
            }
            else {
              pending.push(op)
            }
          }
          break

        case 'disconnect':
          if (!isMany) {
            // One-to-one: cancel with most recent connect
            const connIdx = findLastIndex(pending, p => p.type === 'connect')
            if (connIdx !== -1) {
              pending.splice(connIdx, 1)
            }
            else {
              pending.push(op)
            }
          }
          else if (op.oldValue != null && typeof op.oldValue === 'object' && !Array.isArray(op.oldValue)) {
            // Many-relation: disconnect specific item, check for matching connect to cancel
            const matchIdx = pending.findIndex(p =>
              p.type === 'connect'
              && itemsMatch(p.newValue, op.oldValue),
            )
            if (matchIdx !== -1) {
              pending.splice(matchIdx, 1)
            }
            else {
              pending.push(op)
            }
          }
          else {
            // Disconnect-all: clears all prior connect/disconnect ops on this field
            pending.length = 0
            pending.push(op)
          }
          break
      }
    }

    result.push(...pending)
  }

  // Maintain chronological order
  result.sort((a, b) => a.timestamp - b.timestamp)

  return result
}

/**
 * Apply a single operation to a target object (state projection).
 * Does NOT record the operation — only mutates the target.
 */
function applyOp<TData extends Record<string, any>>(
  target: Record<string, any>,
  op: FormOperation<TData>,
  collection?: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>,
) {
  const fieldStr = String(op.field)
  const relation = collection
    ? (collection.normalizedRelations as Record<string, any>)[fieldStr]
    : undefined

  switch (op.type) {
    case 'set':
      if (relation?.many) {
        // Relation $set on a many-relation
        target[`_$${fieldStr}Data`] = Array.isArray(op.newValue) ? [...op.newValue] : op.newValue
      }
      else {
        target[fieldStr] = op.newValue
      }
      break

    case 'connect':
      if (relation) {
        if (relation.many) {
          const dataKey = `_$${fieldStr}Data`
          if (!Array.isArray(target[dataKey]))
            target[dataKey] = []
          target[dataKey].push(op.newValue)
        }
        else {
          // One-to-one: set FK fields from the on mapping
          for (const to of relation.to) {
            for (const [targetField, sourceField] of Object.entries(to.on)) {
              const sourceFieldName = (sourceField as string).includes('.')
                ? (sourceField as string).split('.').pop()!
                : (sourceField as string)
              const targetFieldName = targetField.includes('.')
                ? targetField.split('.').pop()!
                : targetField
              if (op.newValue?.[targetFieldName] !== undefined) {
                target[sourceFieldName] = op.newValue[targetFieldName]
              }
            }
          }
        }
      }
      break

    case 'disconnect':
      if (relation) {
        if (relation.many) {
          const dataKey = `_$${fieldStr}Data`
          if (op.oldValue && typeof op.oldValue === 'object' && !Array.isArray(op.oldValue)) {
            // Disconnect specific item
            const current = target[dataKey] || []
            const idx = current.findIndex((item: any) => {
              if (!op.oldValue)
                return false
              return Object.entries(op.oldValue).every(([key, value]) => item[key] === value)
            })
            if (idx !== -1)
              current.splice(idx, 1)
          }
          else {
            // Disconnect all
            target[dataKey] = []
          }
        }
        else {
          // One-to-one: clear FK fields
          for (const to of relation.to) {
            for (const [, sourceField] of Object.entries(to.on)) {
              const sourceFieldName = (sourceField as string).includes('.')
                ? (sourceField as string).split('.').pop()!
                : (sourceField as string)
              target[sourceFieldName] = null
            }
          }
        }
      }
      break
  }
}

export function createFormObject<
  TData extends Record<string, any> = Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  const TAdditionalProps = Record<string, never>,
  TResult extends TData | void = TData,
>(options: CreateFormObjectOptions<TData, TSchema, TAdditionalProps, TResult>) {
  let initialData = pickNonSpecialProps(options.defaultValues?.() ?? {}, true) as Partial<TData>

  const onSuccess = createEventHook()
  const onError = createEventHook<Error>()
  const onChange = createEventHook()
  const onConflict: EventHook<FieldConflict[]> = createEventHook<FieldConflict[]>()

  // Event sourcing: op log is the source of truth, state is projected from it
  const opLog = shallowReactive<FormOperation<TData>[]>([])
  const redoStack = shallowReactive<FormOperation<TData>[]>([])
  const relationMethods: Record<string, any> = {}

  const form = reactive({
    ...initialData as TData,
    ...options.additionalProps,

    $error: null,
    $loading: false as boolean,
    async $reset() {
      if (options.resetDefaultValues) {
        const values = await options.resetDefaultValues()
        initialData = pickNonSpecialProps(values, true) as Partial<TData>
      }
      else if (options.defaultValues) {
        initialData = pickNonSpecialProps(options.defaultValues(), true) as Partial<TData>
      }
      // Clear operation log and redo stack on reset
      opLog.length = 0
      redoStack.length = 0
      form.$changedProps = {}
      form.$conflicts = []
      for (const key in form) {
        if (!key.startsWith('$') && !key.startsWith('_$')) {
          delete (form as any)[key]
        }
      }
      Object.assign(form, initialData)
      // Reinitialize relation data and restore methods after reset
      if (options.collection) {
        for (const [rKey, rel] of Object.entries(options.collection.normalizedRelations)) {
          const dataKey = `_$${rKey}Data`
          const initialRelData = initialData[rKey as keyof typeof initialData]
          ;(form as any)[dataKey] = initialRelData
            ? (Array.isArray(initialRelData) ? [...initialRelData as any[]] : initialRelData)
            : (rel.many ? [] : null)
          ;(form as any)[rKey] = relationMethods[rKey]
        }
      }
      // Re-validate after reset
      queueChange()
    },
    async $submit() {
      form.$loading = true
      form.$error = null
      try {
        let data = options?.transformData ? options.transformData(form as unknown as Partial<TData>) : pickNonSpecialProps(form, true) as Partial<TData>
        // Remove internal relation data keys (_$*Data) that shouldn't be submitted
        for (const key of Object.keys(data)) {
          if (key.startsWith('_$')) {
            delete (data as any)[key]
          }
        }
        if (options.validateOnSubmit ?? true) {
          const { issues } = await this.$schema['~standard'].validate(data)
          if (issues) {
            const error = new Error(issues.map(i => i.message).join(', '))
            ;(error as any).$issues = issues
            throw error
          }
        }
        const item = await options.submit(data, { formOperations: optimizeOpLog([...opLog], options.collection) })
        onSuccess.trigger(item)
        if (options.resetOnSuccess ?? true) {
          await form.$reset()
        }
        return item
      }
      catch (error: any) {
        form.$error = error
        onError.trigger(error)
        throw error
      }
      finally {
        form.$loading = false
      }
    },
    $save() {
      console.warn(`$save() is deprecated, use $submit() instead`)
      return this.$submit()
    },
    $schema: markRaw(options.schema ?? emptySchema()) as TSchema,
    $valid: false as boolean,
    $changedProps: {} as FormObjectChanged<TData>,
    $hasChanges: (): boolean => Object.keys(form.$changedProps).length > 0,
    $opLog: {
      getAll: (): FormOperation<TData>[] => [...opLog],
      getOptimized: (): FormOperation<TData>[] => optimizeOpLog([...opLog], options.collection),
      getFieldOps: (field: keyof TData): FormOperation<TData>[] =>
        opLog.filter(op => op.field === field),
      getOpsBy: (filter: OpLogFilterFn<TData>): FormOperation<TData>[] =>
        opLog.filter(filter),
      getLastFieldOp: (field: keyof TData): FormOperation<TData> | undefined => {
        for (let i = opLog.length - 1; i >= 0; i--) {
          const op = opLog[i]
          if (op && op.field === field) {
            return op
          }
        }
        return undefined
      },
      hasFieldChanged: (field: keyof TData): boolean =>
        opLog.some(op => op.field === field),
      getOpsInRange: (startTime: number, endTime: number): FormOperation<TData>[] =>
        opLog.filter(op => op.timestamp >= startTime && op.timestamp <= endTime),
      clear: (): void => {
        opLog.length = 0
        redoStack.length = 0
        form.$changedProps = {}
      },
      undo: (): boolean => {
        if (opLog.length === 0)
          return false
        const op = opLog.pop()!
        redoStack.push(op)
        rebuildState()
        return true
      },
      redo: (): boolean => {
        if (redoStack.length === 0)
          return false
        const op = redoStack.pop()!
        opLog.push(op)
        rebuildState()
        return true
      },
      get canUndo(): boolean {
        return opLog.length > 0
      },
      get canRedo(): boolean {
        return redoStack.length > 0
      },
      stateAt: (index: number): Partial<TData> => {
        const state: Record<string, any> = { ...(initialData as TData) }
        if (options.collection) {
          for (const [rKey, rel] of Object.entries(options.collection.normalizedRelations)) {
            const initialRelData = initialData[rKey as keyof typeof initialData]
            state[`_$${rKey}Data`] = initialRelData
              ? (Array.isArray(initialRelData) ? [...initialRelData as any[]] : initialRelData)
              : (rel.many ? [] : null)
          }
        }
        const count = Math.min(index, opLog.length)
        for (let i = 0; i < count; i++) {
          applyOp(state, opLog[i]!, options.collection)
        }
        return state as Partial<TData>
      },
    } as OpLogAPI<TData>,
    $onSuccess: onSuccess.on,
    $onError: onError.on,
    $onSaved(...args) {
      console.warn(`$onSaved() is deprecated, use $onSuccess() instead`)
      return this.$onSuccess(...args)
    },
    $onChange: onChange.on,
    $rebase: (newBaseData: Partial<TData>, remoteChangedFields?: (keyof TData)[]) => {
      rebaseForm(newBaseData, remoteChangedFields)
    },
    $conflicts: [] as FieldConflict[],
    $resolveConflict: (field: keyof TData, resolution: 'local' | 'remote') => {
      resolveConflict(field, resolution)
    },
    $onConflict: onConflict.on,
  } satisfies FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData>) as FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData>

  // On change

  let changeQueued = false
  let changedSinceLastHandled: FormObjectChanged<TData> = {}

  function queueChange() {
    if (changeQueued) {
      return
    }
    changeQueued = true
    nextTick(async () => {
      changeQueued = false

      // Reset changed props
      onChange.trigger(changedSinceLastHandled)
      changedSinceLastHandled = {}

      // Validate
      const { issues } = await form.$schema['~standard'].validate(pickNonSpecialProps(form))
      form.$valid = !issues
    })
  }

  // Event sourcing helpers

  function updateChangedProps() {
    const changed: FormObjectChanged<TData> = {}
    for (const key in initialData) {
      const current = (form as any)[key]
      const initial = initialData[key]
      if (current !== initial) {
        changed[key as keyof TData] = [current, initial] as [TData[keyof TData], TData[keyof TData]]
      }
    }
    form.$changedProps = changed
  }

  function rebuildState() {
    // Reset all non-special fields to initial values
    for (const key in form) {
      if (!key.startsWith('$') && !key.startsWith('_$')) {
        delete (form as any)[key]
      }
    }
    Object.assign(form, initialData)

    // Reset relation data and restore methods
    if (options.collection) {
      for (const [rKey, rel] of Object.entries(options.collection.normalizedRelations)) {
        const dataKey = `_$${rKey}Data`
        const initialRelData = initialData[rKey as keyof typeof initialData]
        ;(form as any)[dataKey] = initialRelData
          ? (Array.isArray(initialRelData) ? [...initialRelData as any[]] : initialRelData)
          : (rel.many ? [] : null)
        ;(form as any)[rKey] = relationMethods[rKey]
      }
    }

    // Replay all ops from the log (state projection)
    for (const op of opLog) {
      applyOp(form as Record<string, any>, op, options.collection)
    }

    // Derive changed props from projected state
    updateChangedProps()
    changedSinceLastHandled = { ...form.$changedProps }
    queueChange()
  }

  function recordAndApplyOp(opData: Omit<FormOperation<TData>, 'timestamp'>) {
    const op: FormOperation<TData> = { ...opData, timestamp: Date.now() }
    opLog.push(op)
    redoStack.length = 0
    applyOp(form as Record<string, any>, op, options.collection)
    updateChangedProps()
    changedSinceLastHandled = { ...form.$changedProps }
    queueChange()
  }

  // CRDT rebase and conflict resolution

  /**
   * Rebase local changes on top of new remote data.
   * Detects fields that were changed both locally and remotely (conflicts).
   */
  function rebaseForm(newBaseData: Partial<TData>, explicitRemoteChangedFields?: (keyof TData)[]) {
    const cleanNewBase = pickNonSpecialProps(newBaseData, true) as Partial<TData>

    // Determine which fields changed remotely
    // If the caller provides an explicit list (e.g. from a collab broadcast), use it;
    // otherwise fall back to diffing old initial data vs new base.
    const remoteChangedFields: string[] = explicitRemoteChangedFields
      ? explicitRemoteChangedFields.map(String)
      : diffFields(
          initialData as Record<string, any>,
          cleanNewBase as Record<string, any>,
        )

    // Determine which fields were locally modified via the op log
    const localChangedFields = new Set<string>()
    for (const op of opLog) {
      if (op.type === 'set') {
        localChangedFields.add(String(op.field))
      }
    }

    // Detect conflicts: fields changed both locally and remotely with different values
    const conflicts: FieldConflict[] = []
    const now = Date.now()
    for (const field of remoteChangedFields) {
      if (localChangedFields.has(field)) {
        const localValue = (form as any)[field]
        const remoteValue = (cleanNewBase as any)[field]
        if (localValue !== remoteValue) {
          conflicts.push({
            field,
            localValue,
            remoteValue,
            localTimestamp: now,
            remoteTimestamp: now,
          })
        }
      }
    }

    // Update initial data to the new base
    initialData = cleanNewBase

    // Rebuild state: start from new base, replay op log
    rebuildState()

    // Set conflicts
    form.$conflicts = conflicts

    // Trigger conflict event if there are any
    if (conflicts.length > 0) {
      onConflict.trigger(conflicts)
    }
  }

  /**
   * Resolve a field conflict by choosing local or remote value.
   */
  function resolveConflict(field: keyof TData, resolution: 'local' | 'remote') {
    const fieldStr = String(field)

    if (resolution === 'remote') {
      // Remove all ops for this field from the log (accept remote value)
      const opsToRemove: number[] = []
      for (let i = opLog.length - 1; i >= 0; i--) {
        if (String(opLog[i]!.field) === fieldStr && opLog[i]!.type === 'set') {
          opsToRemove.push(i)
        }
      }
      for (const idx of opsToRemove) {
        opLog.splice(idx, 1)
      }
      // Rebuild state to reflect the removal
      rebuildState()
    }
    // For 'local', we keep the current state (local ops are already applied)

    // Remove the resolved conflict
    form.$conflicts = form.$conflicts.filter(
      (c: FieldConflict) => c.field !== fieldStr,
    )
  }

  // Relation cache resolution helpers

  let proxy: any

  function resolveRelationFromCache(relation: any, many: boolean) {
    const store = options.store!
    const cache = store.$cache
    const result: any[] = []

    for (const target of relation.to) {
      const targetCollection = store.$collections.find((m: any) => m.name === target.collection)
      if (!targetCollection)
        continue

      const indexKeys = Object.keys(target.on).sort()
      const indexKey = indexKeys.join(':')
      const indexValues = indexKeys.map((k: string) => {
        const currentKey = target.on[k]!
        const fieldName = (currentKey as string).includes('.')
          ? (currentKey as string).split('.').pop()!
          : currentKey
        return (form as any)[fieldName]
      })

      if (indexValues.every((v: any) => v != null)) {
        const indexValue = indexValues.join(':')
        const items = cache.readItems({
          collection: targetCollection as any,
          indexKey,
          indexValue,
          limit: many ? undefined : 1,
          filter: target.filter
            ? (item: any) => target.filter!(proxy, item)
            : undefined,
        })
        result.push(...items)
      }
    }

    if (many) {
      return result
    }
    return result[0] ?? null
  }

  function tryResolveItemFromCache(partialItem: any, relation: any) {
    if (!partialItem || typeof partialItem !== 'object' || !options.store)
      return null
    const store = options.store

    for (const target of relation.to) {
      const targetCollection = store.$collections.find((m: any) => m.name === target.collection)
      if (!targetCollection)
        continue

      try {
        const key = (targetCollection as any).getKey(partialItem)
        if (isKeyDefined(key)) {
          const cached = store.$cache.readItem({ collection: targetCollection as any, key })
          if (cached)
            return cached
        }
      }
      catch {}
    }

    return null
  }

  function applyFormOpsToManyRelation(fieldKey: string, relation: any, cacheItems: any[]) {
    const result = [...cacheItems]

    // Get optimized operations for this field from the op log
    const fieldOps = optimizeOpLog(
      opLog.filter(op => op.field === fieldKey) as FormOperation<TData>[],
      options.collection,
    )

    for (const op of fieldOps) {
      switch (op.type) {
        case 'set': {
          result.length = 0
          const setItems = Array.isArray(op.newValue) ? op.newValue : [op.newValue]
          for (const item of setItems) {
            const resolved = tryResolveItemFromCache(item, relation)
            result.push(resolved ?? item)
          }
          break
        }
        case 'connect': {
          const resolved = tryResolveItemFromCache(op.newValue, relation)
          result.push(resolved ?? op.newValue)
          break
        }
        case 'disconnect': {
          if (op.oldValue && typeof op.oldValue === 'object' && !Array.isArray(op.oldValue)) {
            const idx = result.findIndex((item: any) => itemsMatch(item, op.oldValue))
            if (idx !== -1)
              result.splice(idx, 1)
          }
          else {
            result.length = 0
          }
          break
        }
      }
    }

    return result
  }

  // We need to create the proxy first and then add relation methods that use it
  proxy = new Proxy(form, {
    set(target, key, value) {
      if (typeof key === 'string' && !key.startsWith('$') && !key.startsWith('_$')) {
        const oldValue = (form as any)[key]

        // New operation invalidates redo history
        redoStack.length = 0

        // Record operation in the log
        opLog.push({
          timestamp: Date.now(),
          field: key as keyof TData,
          type: 'set',
          newValue: value,
          oldValue,
        })

        // Update $changedProps synchronously
        const initialValue = initialData[key as keyof typeof initialData]
        if (value !== initialValue) {
          form.$changedProps[key as keyof TData] = [value, initialValue] as [TData[keyof TData], TData[keyof TData]]
          changedSinceLastHandled[key as keyof TData] = [value, initialValue] as [TData[keyof TData], TData[keyof TData]]
        }
        else {
          delete form.$changedProps[key]
          delete changedSinceLastHandled[key]
        }

        queueChange()
      }
      return Reflect.set(form, key, value)
    },
    get(target, key) {
      // Resolve relation fields from cache when store is available
      if (typeof key === 'string' && options.store && options.collection
        && key in (options.collection.normalizedRelations as Record<string, any>)) {
        const relation = (options.collection.normalizedRelations as Record<string, any>)[key]!
        const methods = relationMethods[key]

        if (!relation.many) {
          // One-to-one: resolve related item from cache using FK values
          const resolved = resolveRelationFromCache(relation, false)
          return { ...methods, value: resolved ?? null }
        }
        else {
          // Many: resolve related items from cache + apply form operations
          const cacheItems = resolveRelationFromCache(relation, true)
          const result = applyFormOpsToManyRelation(key as string, relation, cacheItems as any[])
          return { ...methods, value: result }
        }
      }

      return Reflect.get(form, key)
    },
    ownKeys() {
      return Reflect.ownKeys(form).filter(key => typeof key !== 'string' || (!key.startsWith('$') && !key.startsWith('_$')))
    },
  })

  // Add relation field methods if collection info is provided
  if (options.collection) {
    for (const [relationKey, relation] of Object.entries(options.collection.normalizedRelations)) {
      // Store the actual relation data separately
      const relationDataKey = `_$${relationKey}Data`
      ;(form as any)[relationDataKey] = initialData[relationKey as keyof typeof initialData] || (relation.many ? [] : null)

      // Create event-sourced connect, disconnect, and set methods
      const methods = markRaw({
        connect: (item: Record<string, any>) => {
          recordAndApplyOp({
            field: relationKey as keyof TData,
            type: 'connect',
            newValue: item,
            oldValue: undefined,
          })
        },
        disconnect: (item?: Record<string, any>) => {
          if (relation.many && item) {
            let found: Record<string, any> | undefined
            const current = (form as any)[relationDataKey]
            if (Array.isArray(current)) {
              const index = current.findIndex((currentItem: any) => {
                return Object.entries(item).every(([key, value]) => currentItem[key] === value)
              })
              if (index !== -1) {
                found = current[index]
              }
            }
            // Also check cache-resolved items when store is available
            if (!found && options.store && options.collection) {
              const normalizedRelation = (options.collection.normalizedRelations as Record<string, any>)[relationKey]
              if (normalizedRelation) {
                const cacheItems = resolveRelationFromCache(normalizedRelation, true)
                const cacheMatch = (cacheItems as any[]).find((cacheItem: any) => itemsMatch(cacheItem, item))
                if (cacheMatch) {
                  found = item
                }
              }
            }
            if (found) {
              recordAndApplyOp({
                field: relationKey as keyof TData,
                type: 'disconnect',
                newValue: undefined,
                oldValue: found,
              })
            }
          }
          else if (relation.many) {
            const previous = [...((form as any)[relationDataKey] || [])]
            recordAndApplyOp({
              field: relationKey as keyof TData,
              type: 'disconnect',
              newValue: [],
              oldValue: previous,
            })
          }
          else {
            recordAndApplyOp({
              field: relationKey as keyof TData,
              type: 'disconnect',
              newValue: undefined,
              oldValue: undefined,
            })
          }
        },
        set: (items: Array<Record<string, any>>) => {
          if (relation.many) {
            const previous = [...((form as any)[relationDataKey] || [])]
            recordAndApplyOp({
              field: relationKey as keyof TData,
              type: 'set',
              newValue: [...items],
              oldValue: previous,
            })
          }
          else {
            if (items.length > 0 && items[0]) {
              methods.connect(items[0])
            }
            else {
              methods.disconnect()
            }
          }
        },
      })

      // Set the relation field to the methods object
      relationMethods[relationKey] = methods
      ;(form as any)[relationKey] = methods
    }
  }

  // Validate initially (don't await for it)
  queueChange()

  return proxy as VueFormObject<TData, TSchema, TAdditionalProps, TResult>
}

/**
 * @deprecated Use `createFormObject` instead - all the functionality was moved there
 */
export const createFormObjectWithChangeDetection: typeof createFormObject = (...args) => {
  console.warn(`createFormObjectWithChangeDetection is deprecated, use createFormObject instead`)
  return createFormObject(...args)
}
