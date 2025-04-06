import { type Awaitable, type FormObjectBase, pickNonSpecialProps, type StandardSchemaV1 } from '@rstore/shared'
import { createEventHook, type EventHookOn } from '@vueuse/core'
import { markRaw, reactive } from 'vue'

export interface CreateFormObjectOptions<
  TData extends Record<string, any>,
  TSchema extends StandardSchemaV1,
  TAdditionalProps,
> {
  defaultValues?: (() => Partial<TData>) | undefined
  resetDefaultValues?: (() => Awaitable<Partial<TData>>) | undefined
  schema: TSchema
  transformData?: (data: Partial<TData>) => Partial<TData>
  submit: (data: Partial<TData>) => Promise<TData>
  additionalProps?: TAdditionalProps
}

export interface FormObjectAdditionalProps<
  TData extends Record<string, any>,
> {
  /**
   * @deprecated Use `$onSuccess` instead
   */
  $onSaved: EventHookOn<TData>
  $onSuccess: EventHookOn<TData>
}

export function createFormObject<
  TData extends Record<string, any> = Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  const TAdditionalProps = Record<string, never>,
>(options: CreateFormObjectOptions<TData, TSchema, TAdditionalProps>) {
  const onSuccess = createEventHook()
  const form = reactive({
    ...options.defaultValues?.(),
    ...options.additionalProps,

    $error: null,
    $loading: false as boolean,
    async $reset() {
      for (const key in form) {
        if (!key.startsWith('$')) {
          delete (form as any)[key]
        }
      }
      if (options.resetDefaultValues) {
        const values = await options.resetDefaultValues()
        Object.assign(form, values)
      }
      else if (options.defaultValues) {
        Object.assign(form, options.defaultValues())
      }
    },
    async $submit() {
      form.$loading = true
      form.$error = null
      try {
        const data = options?.transformData ? options.transformData(form as Partial<TData>) : pickNonSpecialProps(form) as Partial<TData>
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
    $schema: markRaw(options.schema),
    $onSuccess: onSuccess.on,
    $onSaved(...args) {
      console.warn(`$onSaved() is deprecated, use $onSuccess() instead`)
      return this.$onSaved(...args)
    },
  } satisfies FormObjectBase<TData, TSchema> & FormObjectAdditionalProps<TData>)
  return form as FormObjectBase<TData, TSchema> & FormObjectAdditionalProps<TData> & TAdditionalProps & Partial<TData>
}

export interface FormObjectWithChangeDetectionAdditionalProps<
  TData extends Record<string, any>,
> {
  $changedProps: Partial<{
    [TKey in keyof TData]: [
      newValue: TData[TKey],
      oldValue: TData[TKey],
    ]
  }>
  $hasChanges: () => boolean
}

export function createFormObjectWithChangeDetection<
  TData extends Record<string, any> = Record<string, any>,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  const TAdditionalProps = Record<string, never>,
>(options: CreateFormObjectOptions<TData, TSchema, TAdditionalProps>) {
  let initialData = options.defaultValues?.() ?? {} as Partial<TData>

  const form = createFormObject<TData, TSchema, TAdditionalProps & FormObjectWithChangeDetectionAdditionalProps<TData>>({
    ...options,
    additionalProps: {
      ...options.additionalProps!,
      $changedProps: {},
      $hasChanges: (): boolean => Object.keys(form.$changedProps).length > 0,
    },
    resetDefaultValues: async () => {
      form.$changedProps = {}
      initialData = pickNonSpecialProps(options.resetDefaultValues ? await options.resetDefaultValues() : options.defaultValues?.() ?? {})
      return initialData
    },
  })

  // Detect changed props
  const proxy = new Proxy(form, {
    get(target, key) {
      return Reflect.get(target, key)
    },
    set(target, key, value) {
      if (typeof key === 'string' && key in form) {
        const oldValue = initialData[key as keyof typeof initialData]
        if (value !== oldValue) {
          form.$changedProps[key as keyof TData] = [value, oldValue] as [TData[keyof TData], TData[keyof TData]]
        }
        else {
          delete form.$changedProps[key]
        }
      }
      return Reflect.set(target, key, value)
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter(key => typeof key !== 'string' || !key.startsWith('$'))
    },
  })

  return proxy as FormObjectBase<TData, TSchema> & FormObjectAdditionalProps<TData> & TAdditionalProps & FormObjectWithChangeDetectionAdditionalProps<TData> & Partial<TData>
}
