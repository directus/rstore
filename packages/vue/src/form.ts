import { emptySchema } from '@rstore/core'
import { type Awaitable, type CreateFormObject, type FormObjectBase, type Model, type ModelDefaults, type ModelList, pickNonSpecialProps, type ResolvedModelItem, type StandardSchemaV1, type UpdateFormObject } from '@rstore/shared'
import { createEventHook, type EventHookOn } from '@vueuse/core'
import { markRaw, nextTick, reactive } from 'vue'

export interface CreateFormObjectOptions<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1,
  TAdditionalProps,
> {
  defaultValues?: (() => Partial<TData>) | undefined
  resetDefaultValues?: (() => Awaitable<Partial<TData>>) | undefined
  schema?: TSchema
  transformData?: (data: Partial<TData>) => Partial<TData>
  submit: (data: Partial<TData>) => Promise<TData>
  additionalProps?: TAdditionalProps
}

export type FormObjectChanged<TData> = {
  [TKey in keyof TData]?: [
    newValue: TData[TKey],
    oldValue: TData[TKey],
  ] | undefined
}

export interface FormObjectAdditionalProps<
  TData extends Record<string, any>,
> {
  $changedProps: FormObjectChanged<TData>
  $hasChanges: () => boolean
  /**
   * @deprecated Use `$onSuccess` instead
   */
  $onSaved: EventHookOn<TData>
  $onSuccess: EventHookOn<TData>
  $onError: EventHookOn<Error>
  $onChange: EventHookOn<FormObjectChanged<TData>>
}

type VueFormObject<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TAdditionalProps = Record<string, never>,
> = FormObjectBase<TData, TSchema> & FormObjectAdditionalProps<TData> & TAdditionalProps & Partial<TData> & (() => Promise<TData>)

/**
 * Object returned by `store.<Model>.createForm()`
 */
export type VueCreateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = CreateFormObject<TModel, TModelDefaults, TModelList> & VueFormObject<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

/**
 * Object returned by `store.<Model>.updateForm()`
 */
export type VueUpdateFormObject<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = UpdateFormObject<TModel, TModelDefaults, TModelList> & VueFormObject<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

export function createFormObject<
  TData extends Record<string, any> = Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  const TAdditionalProps = Record<string, never>,
>(options: CreateFormObjectOptions<TData, TSchema, TAdditionalProps>) {
  let initialData = pickNonSpecialProps(options.defaultValues?.() ?? {}) as Partial<TData>

  const onSuccess = createEventHook()
  const onError = createEventHook<Error>()
  const onChange = createEventHook()

  const form = reactive({
    ...options.defaultValues?.(),
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
        initialData = pickNonSpecialProps(values) as Partial<TData>
      }
      else if (options.defaultValues) {
        initialData = pickNonSpecialProps(options.defaultValues()) as Partial<TData>
      }
      Object.assign(form, initialData)
    },
    async $submit() {
      form.$loading = true
      form.$error = null
      try {
        const data = options?.transformData ? options.transformData(form as unknown as Partial<TData>) : pickNonSpecialProps(form) as Partial<TData>
        const { issues } = await this.$schema['~standard'].validate(data)
        if (issues) {
          const error = new Error(issues.map(i => i.message).join(', '))
          ;(error as any).$issues = issues
          throw error
        }
        const item = await options.submit(data)
        onSuccess.trigger(item)
        await form.$reset()
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
  } satisfies FormObjectBase<TData, TSchema> & FormObjectAdditionalProps<TData>) as FormObjectBase<TData, TSchema> & FormObjectAdditionalProps<TData>

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

  return proxy as VueFormObject<TData, TSchema, TAdditionalProps>
}

/**
 * @deprecated Use `createFormObject` instead - all the functionality was moved there
 */
export const createFormObjectWithChangeDetection: typeof createFormObject = (...args) => {
  console.warn(`createFormObjectWithChangeDetection is deprecated, use createFormObject instead`)
  return createFormObject(...args)
}
