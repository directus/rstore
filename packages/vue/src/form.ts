import { emptySchema } from '@rstore/core'
import { type Awaitable, type Collection, type CollectionDefaults, type CreateFormObject, type FormObjectBase, pickNonSpecialProps, type ResolvedCollectionItem, type StandardSchemaV1, type StoreSchema, type UpdateFormObject } from '@rstore/shared'
import { createEventHook, type EventHookOn } from '@vueuse/core'
import { markRaw, nextTick, reactive } from 'vue'

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
  submit: (data: Partial<TData>) => Promise<TResult>
  /**
   * Additional properties to add to the form object. Their name must start with `$` to avoid conflicts with form fields.
   */
  additionalProps?: TAdditionalProps
  /**
   * Resets the form to default values after a successful submission
   * @default true
   */
  resetOnSuccess?: boolean
}

export type FormObjectChanged<TData> = {
  [TKey in keyof TData]?: [
    newValue: TData[TKey],
    oldValue: TData[TKey],
  ] | undefined
}

export interface FormObjectAdditionalProps<
  TData extends Record<string, any>,
  TResult extends TData | void = TData,
> {
  $changedProps: FormObjectChanged<TData>
  $hasChanges: () => boolean
  /**
   * @deprecated Use `$onSuccess` instead
   */
  $onSaved: EventHookOn<TResult>
  $onSuccess: EventHookOn<TResult>
  $onError: EventHookOn<Error>
  $onChange: EventHookOn<FormObjectChanged<TData>>
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

  const form = reactive({
    ...initialData as TData,
    ...options.additionalProps,

    $error: null,
    $loading: false as boolean,
    async $reset() {
      form.$changedProps = {}
      for (const key in form) {
        if (!key.startsWith('$')) {
          delete (form as any)[key]
        }
      }
      if (options.resetDefaultValues) {
        const values = await options.resetDefaultValues()
        initialData = pickNonSpecialProps(values, true) as Partial<TData>
      }
      else if (options.defaultValues) {
        initialData = pickNonSpecialProps(options.defaultValues(), true) as Partial<TData>
      }
      Object.assign(form, initialData)
    },
    async $submit() {
      form.$loading = true
      form.$error = null
      try {
        const data = options?.transformData ? options.transformData(form as unknown as Partial<TData>) : pickNonSpecialProps(form, true) as Partial<TData>
        const { issues } = await this.$schema['~standard'].validate(data)
        if (issues) {
          const error = new Error(issues.map(i => i.message).join(', '))
          ;(error as any).$issues = issues
          throw error
        }
        const item = await options.submit(data)
        onSuccess.trigger(item)
        if (options.resetOnSuccess || options.resetOnSuccess == null) {
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
    $onSuccess: onSuccess.on,
    $onError: onError.on,
    $onSaved(...args) {
      console.warn(`$onSaved() is deprecated, use $onSuccess() instead`)
      return this.$onSaved(...args)
    },
    $onChange: onChange.on,
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

  const proxy = new Proxy(form, {
    set(target, key, value) {
      if (typeof key === 'string' && !key.startsWith('$')) {
        const oldValue = initialData[key as keyof typeof initialData]
        if (value !== oldValue) {
          changedSinceLastHandled[key as keyof TData] = form.$changedProps[key as keyof TData] = [value, oldValue] as [TData[keyof TData], TData[keyof TData]]
        }
        else {
          delete changedSinceLastHandled[key]
          delete form.$changedProps[key]
        }
        queueChange()
      }
      return Reflect.set(form, key, value)
    },
    get(target, key) {
      return Reflect.get(form, key)
    },
    ownKeys() {
      return Reflect.ownKeys(form).filter(key => typeof key !== 'string' || !key.startsWith('$'))
    },
  })

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
