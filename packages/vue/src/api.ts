import type { CreateFormObject, CreateFormObjectBase, CustomHookMeta, FindFirstOptions, FindManyOptions, FindOptions, HybridPromise, Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem, ResolvedModelItemBase, StandardSchemaV1, StoreCore, UpdateFormObject, WrappedItem } from '@rstore/shared'
import type { EventHookOn } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'
import type { VueLiveQueryReturn } from './live'
import type { VueQueryReturn } from './query'
import { createItem, deleteItem, findFirst, findMany, peekFirst, peekMany, subscribe, unsubscribe, updateItem } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { createEventHook, tryOnScopeDispose } from '@vueuse/core'
import { markRaw, reactive, toValue, watch } from 'vue'
import { createQuery } from './query'

interface CreateFormObjectAdditional<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  $onSaved: EventHookOn<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
}

interface UpdateFormObjectAdditional<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  $hasChanges: () => boolean
  $changedProps: Partial<{
    [TKey in keyof ResolvedModelItem<TModel, TModelDefaults, TModelList>]: [
      newValue: ResolvedModelItem<TModel, TModelDefaults, TModelList>[TKey],
      oldValue: ResolvedModelItem<TModel, TModelDefaults, TModelList>[TKey],
    ]
  }>
  $onSaved: EventHookOn<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
}

export interface VueModelApi<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
  TItem extends WrappedItem<TModel, TModelDefaults, TModelList>,
> {
  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   */
  peekFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TModelList>>,
  ) => WrappedItem<TModel, TModelDefaults, TModelList> | null

  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   */
  findFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TModelList>>,
  ) => Promise<WrappedItem<TModel, TModelDefaults, TModelList> | null>

  /**
   * Create a reactive query for the first item that matches the given options.
   */
  queryFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TModelList>>,
  ) => HybridPromise<VueQueryReturn<TModel, TModelDefaults, TModelList, TItem | null>>

  /**
   * Find all items that match the query in the cache without fetching the data from the adapter plugins.
   */
  peekMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TModelList> | undefined>,
  ) => Array<WrappedItem<TModel, TModelDefaults, TModelList>>

  /**
   * Find all items that match the query.
   */
  findMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TModelList> | undefined>,
  ) => Promise<Array<WrappedItem<TModel, TModelDefaults, TModelList>>>

  /**
   * Create a reactive query for all items that match the given options.
   */
  queryMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TModelList> | undefined>,
  ) => HybridPromise<VueQueryReturn<TModel, TModelDefaults, TModelList, Array<TItem>>>

  /**
   * Create an item directly. For a more user-friendly way, use `createForm` instead.
   */
  create: (
    item: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>,
  ) => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

  /**
   * (Recommended) The form object helps you creating a new item.
   */
  createForm: (
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       */
      defaultValues?: () => Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

      /**
       * Schema to validate the form object.
       *
       * @default model.schema.create
       */
      schema?: StandardSchemaV1
    },
  ) => CreateFormObject<TModel, TModelDefaults, TModelList> & CreateFormObjectAdditional<TModel, TModelDefaults, TModelList>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  update: (
    item: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>,
    updateOptions?: {
      key?: string | number | null
    }
  ) => Promise<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

  /**
   * (Recommended) The form object helps you updating an existing item. If the item is not loaded yet, it will be fetched first to pre-fill the form.
   */
  updateForm: (
    options: string | number | FindFirstOptions<TModel, TModelDefaults, TModelList>,
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       *
       * By default `updateForm` will initialize the fields with the existing item data.
       */
      defaultValues?: () => Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

      /**
       * Schema to validate the form object.
       *
       * @default model.schema.update
       */
      schema?: StandardSchemaV1
    },
  ) => Promise<UpdateFormObject<TModel, TModelDefaults, TModelList> & UpdateFormObjectAdditional<TModel, TModelDefaults, TModelList>>

  /**
   * Find all items that match the query.
   */
  delete: (
    keyOrItem: string | number | Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>,
  ) => Promise<void>

  subscribe: (
    keyOrFindOptions?: MaybeRefOrGetter<string | number | FindOptions<TModel, TModelDefaults, TModelList> | undefined>,
  ) => Promise<{
    unsubscribe: () => Promise<void>
  }>

  liveQueryFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TModelList>>,
  ) => HybridPromise<VueLiveQueryReturn<TModel, TModelDefaults, TModelList, TItem | null>>

  liveQueryMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TModelList> | undefined>,
  ) => HybridPromise<VueLiveQueryReturn<TModel, TModelDefaults, TModelList, Array<TItem>>>

  getKey: (
    item: ResolvedModelItem<TModel, TModelDefaults, TModelList>,
  ) => string | number | null | undefined
}

export function createModelApi<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>(
  store: StoreCore<TModelList, TModelDefaults>,
  model: ResolvedModel<TModel, TModelDefaults, TModelList>,
): VueModelApi<TModel, TModelDefaults, TModelList, WrappedItem<TModel, TModelDefaults, TModelList>> {
  type Api = VueModelApi<TModel, TModelDefaults, TModelList, WrappedItem<TModel, TModelDefaults, TModelList>>
  const api: Api = {
    peekFirst: findOptions => peekFirst({
      store,
      model,
      findOptions: toValue(findOptions),
    }).result,

    findFirst: findOptions => findFirst({
      store,
      model,
      findOptions: toValue(findOptions),
    }).then(r => r.result),

    queryFirst: options => createQuery({
      store,
      fetchMethod: options => findFirst({ store, model, findOptions: options! }).then(r => r.result),
      cacheMethod: options => peekFirst({ store, model, findOptions: options!, force: true }).result,
      defaultValue: null,
      // @ts-expect-error @TODO fix type issue with options being a possible string
      options,
    }),

    peekMany: findOptions => peekMany({
      store,
      model,
      findOptions: toValue(findOptions),
    }).result,

    findMany: findOptions => findMany({
      store,
      model,
      findOptions: toValue(findOptions),
    }).then(r => r.result),

    queryMany: options => createQuery({
      store,
      fetchMethod: options => findMany({ store, model, findOptions: options }).then(r => r.result),
      cacheMethod: options => peekMany({ store, model, findOptions: options, force: true }).result,
      defaultValue: [],
      options,
    }),

    create: item => createItem({
      store,
      model,
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
            const data = pickNonSpecialProps(form) as Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
            await this.$schema['~standard'].validate(data)
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
        $schema: markRaw(formOptions?.schema ?? model.formSchema.create),
        $onSaved: onSaved.on,
      } satisfies CreateFormObjectBase<TModel, TModelDefaults, TModelList> & CreateFormObjectAdditional<TModel, TModelDefaults, TModelList>) as TReturn
      return form
    },

    update: (item, updateOptions) => updateItem({
      store,
      model,
      item,
      key: updateOptions?.key,
    }),

    updateForm: async (options, formOptions) => {
      type TReturn = Awaited<ReturnType<Api['updateForm']>>

      const onSaved = createEventHook()

      async function getFormData(): Promise<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>> {
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
            const data = pickNonSpecialProps(form) as Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>
            await this.$schema['~standard'].validate(data)
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
        $schema: markRaw(formOptions?.schema ?? model.formSchema.update),
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
      let key: string | number | number
      if (typeof keyOrItem !== 'string') {
        const result = model.getKey(keyOrItem)
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
        model,
        key,
      })
    },

    subscribe: async (keyOrFindOptions) => {
      if (store.$isServer) {
        return {
          unsubscribe: () => Promise.resolve(),
        }
      }

      const meta: CustomHookMeta = {}

      let subscriptionId: string | undefined
      let previousKey: string | number | undefined
      let previousFindOptions: FindOptions<TModel, TModelDefaults, TModelList> | undefined

      async function unsub() {
        if (subscriptionId) {
          unsubscribe({
            store,
            meta,
            model,
            subscriptionId,
            key: previousKey,
            findOptions: previousFindOptions,
          })
          subscriptionId = undefined
          previousKey = undefined
          previousFindOptions = undefined
        }
      }

      async function sub(optionsValue: string | number | FindOptions<TModel, TModelDefaults, TModelList> | undefined) {
        await unsub()

        subscriptionId = crypto.randomUUID()

        const key = previousKey = typeof optionsValue === 'string' ? optionsValue : undefined
        const findOptions = previousFindOptions = typeof optionsValue === 'object' ? optionsValue : undefined

        await subscribe({
          store,
          meta,
          model,
          subscriptionId,
          key,
          findOptions,
        })
      }

      watch(() => toValue(keyOrFindOptions), async (optionsValue) => {
        await sub(optionsValue)
      }, {
        immediate: true,
      })

      tryOnScopeDispose(unsub)

      return {
        unsubscribe: unsub,
      }
    },

    liveQueryFirst: (options) => {
      api.subscribe(options)
      return api.queryFirst(options)
    },

    liveQueryMany: (options) => {
      api.subscribe(options)
      return api.queryMany(options)
    },

    getKey: item => model.getKey(item),
  }
  return api
}
