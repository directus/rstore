import type { Awaitable, Cache, Collection, CollectionDefaults, CreateFormObject, FieldConflict, FormObjectBase, FormOperation, ResolvedCollection, ResolvedCollectionItem, StandardSchemaV1, StoreSchema, UpdateFormObject } from '@rstore/shared'
import type { EventHookOn } from '@vueuse/core'

export type { FormOperation, FormOperationType } from '@rstore/shared'

export type OpLogFilterFn<TData extends Record<string, any> = Record<string, any>> = (operation: FormOperation<TData>) => boolean

export interface OpLogAPI<TData extends Record<string, any> = Record<string, any>> {
  /** Get a copy of all operations. */
  getAll: () => FormOperation<TData>[]
  /** Get an optimized copy of operations with redundant relation operations removed. */
  getOptimized: () => FormOperation<TData>[]
  /** Get operations for a specific field. */
  getFieldOps: (field: keyof TData) => FormOperation<TData>[]
  /** Get operations that match a filter. */
  getOpsBy: (filter: OpLogFilterFn<TData>) => FormOperation<TData>[]
  /** Get the last operation for a field. */
  getLastFieldOp: (field: keyof TData) => FormOperation<TData> | undefined
  /** Check if a field has been changed in the op log. */
  hasFieldChanged: (field: keyof TData) => boolean
  /** Get operations between two timestamps. */
  getOpsInRange: (startTime: number, endTime: number) => FormOperation<TData>[]
  /** Clear the operation log, redo stack, and reset changed props. */
  clear: () => void
  /** Undo the last operation and rebuild state from the log. */
  undo: () => boolean
  /** Redo the last undone operation and rebuild state. */
  redo: () => boolean
  /** Whether there are operations that can be undone. */
  readonly canUndo: boolean
  /** Whether there are operations that can be redone. */
  readonly canRedo: boolean
  /** Compute a snapshot of state at a specific operation index. */
  stateAt: (index: number) => Partial<TData>
}

export interface CreateFormObjectOptions<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1,
  TAdditionalProps,
  TResult extends TData | void = TData,
> {
  /** Function returning the default values for the form. */
  defaultValues?: (() => Partial<TData>) | undefined
  /** Function returning default values for `$reset()`. */
  resetDefaultValues?: (() => Awaitable<Partial<TData>>) | undefined
  /** Standard Schema v1-compatible schema to validate against. */
  schema?: TSchema
  /** Transform form data before submission. */
  transformData?: (data: Partial<TData>) => Partial<TData>
  /** Function called when the form is submitted. */
  submit: (data: Partial<TData>, context: { formOperations: FormOperation<TData>[] }) => Promise<TResult>
  /** Additional `$`-prefixed properties to add to the form object. */
  additionalProps?: TAdditionalProps
  /** Reset form to defaults after successful submission. */
  resetOnSuccess?: boolean
  /** Validate using `schema` when `$submit()` is called. */
  validateOnSubmit?: boolean
  /** Optional collection information to enable relation field methods. */
  collection?: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  /** Optional store reference to enable resolving relation fields from cache. */
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
 * Relation field methods for connecting/disconnecting related items.
 */
export interface RelationFieldMethods<TItem = any> {
  /** Current resolved relation value. */
  value: TItem | TItem[] | null
  /** Connect a related item by its identifier(s). */
  connect: (item: Partial<TItem>) => void
  /** Disconnect the related item(s). */
  disconnect: (item?: Partial<TItem>) => void
  /** Set related items for many relations. */
  set: (items: Array<Partial<TItem>>) => void
}

export interface FormObjectAdditionalProps<
  TData extends Record<string, any>,
  TResult extends TData | void = TData,
> {
  $changedProps: FormObjectChanged<TData>
  $hasChanges: () => boolean
  /** Read a backing form field without invoking proxy-only relation facades. */
  $getRaw: <TKey extends PropertyKey>(field: TKey) => TKey extends keyof TData ? TData[TKey] | undefined : unknown
  /** Return the public backing form data without proxy-only relation facades. */
  $getRawData: (options?: { clone?: boolean }) => Partial<TData>
  /** Operation log API for querying and managing change history. */
  $opLog: OpLogAPI<TData>
  /** @deprecated Use `$onSuccess` instead. */
  $onSaved: EventHookOn<TResult>
  $onSuccess: EventHookOn<TResult>
  $onError: EventHookOn<Error>
  $onChange: EventHookOn<FormObjectChanged<TData>>
  /** Rebase local changes on top of new remote data. */
  $rebase: (newBaseData: Partial<TData>, remoteChangedFields?: (keyof TData)[]) => void
  /** Active field-level conflicts detected during the last `$rebase`. */
  $conflicts: FieldConflict[]
  /** Resolve a conflict by choosing local or remote value. */
  $resolveConflict: (field: keyof TData, resolution: 'local' | 'remote') => void
  /** Register a callback for conflicts detected during rebase. */
  $onConflict: EventHookOn<FieldConflict[]>
}

export type VueFormObject<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TAdditionalProps = Record<string, never>,
  TResult extends TData | void = TData,
> = FormObjectBase<TResult, TSchema> & FormObjectAdditionalProps<TData, TResult> & TAdditionalProps & Partial<TData> & (() => Promise<TData>)

/**
 * Object returned by `store.<Collection>.createForm()`.
 */
export type VueCreateFormObject<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = CreateFormObject<TCollection, TCollectionDefaults, TSchema> & VueFormObject<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

/**
 * Object returned by `store.<Collection>.updateForm()`.
 */
export type VueUpdateFormObject<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = UpdateFormObject<TCollection, TCollectionDefaults, TSchema> & VueFormObject<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
