import type { CreateFormObject, FindFirstOptions, FindManyOptions, HybridPromise, Model, ModelDefaults, ModelType, ResolvedModelItem, ResolvedModelItemBase, ResolvedModelType, StoreCore, UpdateFormObject, WrappedItem } from '@rstore/shared'
import type { EventHookOn } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'
import type { VueQueryReturn } from './query'
import { createItem, deleteItem, findFirst, findMany, peekFirst, peekMany, updateItem } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { createEventHook } from '@vueuse/core'
import { markRaw, reactive, toValue } from 'vue'
import { createQuery } from './query'

export interface VueModelApi<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
  TItem extends WrappedItem<TModelType, TModelDefaults, TModel>,
> {
  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   */
  peekFirst: (
    options: MaybeRefOrGetter<string | FindFirstOptions<TModelType, TModelDefaults, TModel>>,
  ) => WrappedItem<TModelType, TModelDefaults, TModel> | null

  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   */
  findFirst: (
    options: MaybeRefOrGetter<string | FindFirstOptions<TModelType, TModelDefaults, TModel>>,
  ) => Promise<WrappedItem<TModelType, TModelDefaults, TModel> | null>

  /**
   * Create a reactive query for the first item that matches the given options.
   */
  queryFirst: (
    options: MaybeRefOrGetter<string | FindFirstOptions<TModelType, TModelDefaults, TModel>>,
  ) => HybridPromise<VueQueryReturn<TModelType, TModelDefaults, TModel, TItem | null>>

  /**
   * Find all items that match the query in the cache without fetching the data from the adapter plugins.
   */
  peekMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModelType, TModelDefaults, TModel> | undefined>,
  ) => Array<WrappedItem<TModelType, TModelDefaults, TModel>>

  /**
   * Find all items that match the query.
   */
  findMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModelType, TModelDefaults, TModel> | undefined>,
  ) => Promise<Array<WrappedItem<TModelType, TModelDefaults, TModel>>>

  /**
   * Create a reactive query for all items that match the given options.
   */
  queryMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModelType, TModelDefaults, TModel> | undefined>,
  ) => HybridPromise<VueQueryReturn<TModelType, TModelDefaults, TModel, Array<TItem>>>

  /**
   * Create an item directly. For a more user-friendly way, use `createForm` instead.
   */
  create: (
    item: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>,
  ) => Promise<ResolvedModelItem<TModelType, TModelDefaults, TModel>>

  /**
   * (Recommended) The form object helps you creating a new item.
   */
  createForm: (
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       */
      defaultValues?: () => Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
    },
  ) => CreateFormObject<TModelType, TModelDefaults, TModel> & {
    $onSaved: EventHookOn<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  }

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  update: (
    item: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>,
    updateOptions?: {
      key?: string | null
    }
  ) => Promise<ResolvedModelItem<TModelType, TModelDefaults, TModel>>

  /**
   * (Recommended) The form object helps you updating an existing item. If the item is not loaded yet, it will be fetched first to pre-fill the form.
   */
  updateForm: (
    options: string | FindFirstOptions<TModelType, TModelDefaults, TModel>,
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       *
       * By default `updateForm` will initialize the fields with the existing item data.
       */
      defaultValues?: () => Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
    },
  ) => Promise<UpdateFormObject<TModelType, TModelDefaults, TModel> & {
    $hasChanges: () => boolean
    $changedProps: Partial<{
      [TKey in keyof ResolvedModelItem<TModelType, TModelDefaults, TModel>]: [
        newValue: ResolvedModelItem<TModelType, TModelDefaults, TModel>[TKey],
        oldValue: ResolvedModelItem<TModelType, TModelDefaults, TModel>[TKey],
      ]
    }>
    $onSaved: EventHookOn<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  }>

  /**
   * Find all items that match the query.
   */
  delete: (
    keyOrItem: string | Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>,
  ) => Promise<void>
}

export function createModelApi<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>(
  store: StoreCore<TModel, TModelDefaults>,
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>,
): VueModelApi<TModel[keyof TModel], TModelDefaults, TModel, WrappedItem<TModel[keyof TModel], TModelDefaults, TModel>> {
  type Api = VueModelApi<TModel[keyof TModel], TModelDefaults, TModel, WrappedItem<TModel[keyof TModel], TModelDefaults, TModel>>
  const api: Api = {
    peekFirst: findOptions => peekFirst({
      store,
      type,
      findOptions: toValue(findOptions),
    }).result,

    findFirst: findOptions => findFirst({
      store,
      type,
      findOptions: toValue(findOptions),
    }).then(r => r.result),

    queryFirst: options => createQuery({
      store,
      fetchMethod: options => findFirst({ store, type, findOptions: options! }).then(r => r.result),
      cacheMethod: options => peekFirst({ store, type, findOptions: options! }).result,
      defaultValue: null,
      // @ts-expect-error @TODO fix type issue with options being a possible string
      options,
    }),

    peekMany: findOptions => peekMany({
      store,
      type,
      findOptions: toValue(findOptions),
    }).result,

    findMany: findOptions => findMany({
      store,
      type,
      findOptions: toValue(findOptions),
    }).then(r => r.result),

    queryMany: options => createQuery({
      store,
      fetchMethod: options => findMany({ store, type, findOptions: options }).then(r => r.result),
      cacheMethod: options => peekMany({ store, type, findOptions: options }).result,
      defaultValue: [],
      options,
    }),

    create: item => createItem({
      store,
      type,
      item,
    }),

    createForm: (formOptions) => {
      type TReturn = ReturnType<Api['createForm']>

      const onSaved = createEventHook()
      const form = reactive({
        ...formOptions?.defaultValues?.(),

        $error: null,
        $loading: false,
        $reset() {
          for (const key in form) {
            if (!key.startsWith('$')) {
              delete (form as any)[key]
            }
          }
          if (formOptions?.defaultValues) {
            Object.assign(form, formOptions.defaultValues())
          }
        },
        async $save() {
          form.$loading = true
          form.$error = null
          try {
            const data = pickNonSpecialProps(form) as Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
            await type.schema.create['~standard'].validate(data)
            const item = await api.create(data)
            onSaved.trigger(item)
            form.$reset()
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
        $schema: markRaw(type.schema.create),
        $onSaved: onSaved.on,
      } satisfies TReturn) as TReturn
      return form
    },

    update: (item, updateOptions) => updateItem({
      store,
      type,
      item,
      key: updateOptions?.key,
    }),

    updateForm: async (options, formOptions) => {
      type TReturn = Awaited<ReturnType<Api['updateForm']>>

      const onSaved = createEventHook()

      async function getFormData(): Promise<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>> {
        const item = await api.findFirst(options)

        if (!item) {
          throw new Error('Item not found')
        }

        return pickNonSpecialProps(item)
      }

      let initialData = await getFormData()

      const form = reactive({
        ...formOptions?.defaultValues?.(),
        ...initialData,

        $error: null,
        $loading: false,
        $changedProps: {},
        $hasChanges: () => Object.keys(form.$changedProps).length > 0,
        async $reset() {
          if (formOptions?.defaultValues) {
            Object.assign(form, formOptions.defaultValues())
          }
          initialData = await getFormData()
          for (const key in form) {
            if (!key.startsWith('$')) {
              (form as any)[key] = initialData[key]
            }
          }
          form.$changedProps = {}
        },
        async $save() {
          form.$loading = true
          form.$error = null
          try {
            const data = pickNonSpecialProps(form) as Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
            await type.schema.update['~standard'].validate(data)
            const item = await api.update(data)
            onSaved.trigger(item)
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
        $schema: markRaw(type.schema.update),
        $onSaved: onSaved.on,
      } satisfies TReturn) as TReturn

      // Detect changed props
      const proxy = new Proxy(form, {
        get(target, key) {
          return Reflect.get(target, key)
        },
        set(target, key, value) {
          if (typeof key === 'string' && key.startsWith('$')) {
            throw new Error('Cannot set special props')
          }

          if (typeof key === 'string' && key in form) {
            const oldValue = initialData[key]
            if (value !== oldValue) {
              form.$changedProps[key as keyof typeof form.$changedProps] = [value, oldValue]
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

      return proxy
    },

    delete: (keyOrItem) => {
      let key: string
      if (typeof keyOrItem !== 'string') {
        const result = type.getKey(keyOrItem)
        if (!result) {
          throw new Error('Item delete failed: key is not defined')
        }
        key = result
      }
      else {
        key = keyOrItem
      }

      return deleteItem({
        store,
        type,
        key,
      })
    },
  }
  return api
}
