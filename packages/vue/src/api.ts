import type { CustomHookMeta, FindFirstOptions, FindManyOptions, FindOptions, HybridPromise, Model, ModelDefaults, ResolvedModel, ResolvedModelItem, ResolvedModelItemBase, StandardSchemaV1, StoreSchema, WrappedItem } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { VueLiveQueryReturn } from './live'
import type { VueQueryReturn } from './query'
import type { VueStore } from './store'
import { createItem, deleteItem, findFirst, findMany, peekFirst, peekMany, subscribe, unsubscribe, updateItem } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { tryOnScopeDispose } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'
import { createFormObject, type VueCreateFormObject, type VueUpdateFormObject } from './form'
import { createQuery } from './query'

export interface VueModelApi<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TModel, TModelDefaults, TSchema>,
> {
  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   */
  peekFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TSchema>>,
  ) => WrappedItem<TModel, TModelDefaults, TSchema> | null

  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   */
  findFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TSchema>>,
  ) => Promise<WrappedItem<TModel, TModelDefaults, TSchema> | null>

  /**
   * Create a reactive query for the first item that matches the given options.
   */
  queryFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TSchema> | { enabled: false }>,
  ) => HybridPromise<VueQueryReturn<TModel, TModelDefaults, TSchema, TItem | null>>

  /**
   * Find all items that match the query in the cache without fetching the data from the adapter plugins.
   */
  peekMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TSchema> | undefined>,
  ) => Array<WrappedItem<TModel, TModelDefaults, TSchema>>

  /**
   * Find all items that match the query.
   */
  findMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TSchema> | undefined>,
  ) => Promise<Array<WrappedItem<TModel, TModelDefaults, TSchema>>>

  /**
   * Create a reactive query for all items that match the given options.
   */
  queryMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TSchema> | undefined | { enabled: false }>,
  ) => HybridPromise<VueQueryReturn<TModel, TModelDefaults, TSchema, Array<TItem>>>

  /**
   * Create an item directly. For a more user-friendly way, use `createForm` instead.
   */
  create: (
    item: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>,
  ) => Promise<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

  /**
   * (Recommended) The form object helps you creating a new item.
   */
  createForm: (
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       */
      defaultValues?: () => Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

      /**
       * Schema to validate the form object.
       *
       * @default model.schema.create
       */
      schema?: StandardSchemaV1
    },
  ) => VueCreateFormObject<TModel, TModelDefaults, TSchema>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  update: (
    item: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>,
    updateOptions?: {
      key?: string | number | null
    }
  ) => Promise<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

  /**
   * (Recommended) The form object helps you updating an existing item. If the item is not loaded yet, it will be fetched first to pre-fill the form.
   */
  updateForm: (
    options: string | number | FindFirstOptions<TModel, TModelDefaults, TSchema>,
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       *
       * By default `updateForm` will initialize the fields with the existing item data.
       */
      defaultValues?: () => Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

      /**
       * Schema to validate the form object.
       *
       * @default model.schema.update
       */
      schema?: StandardSchemaV1
    },
  ) => Promise<VueUpdateFormObject<TModel, TModelDefaults, TSchema>>

  /**
   * Find all items that match the query.
   */
  delete: (
    keyOrItem: string | number | Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>,
  ) => Promise<void>

  subscribe: (
    keyOrFindOptions?: MaybeRefOrGetter<string | number | FindOptions<TModel, TModelDefaults, TSchema> | undefined>,
  ) => {
    unsubscribe: () => Promise<void>
    meta: Ref<CustomHookMeta>
  }

  liveQueryFirst: (
    options: MaybeRefOrGetter<string | number | FindFirstOptions<TModel, TModelDefaults, TSchema>>,
  ) => HybridPromise<VueLiveQueryReturn<TModel, TModelDefaults, TSchema, TItem | null>>

  liveQueryMany: (
    options?: MaybeRefOrGetter<FindManyOptions<TModel, TModelDefaults, TSchema> | undefined>,
  ) => HybridPromise<VueLiveQueryReturn<TModel, TModelDefaults, TSchema, Array<TItem>>>

  getKey: (
    item: ResolvedModelItem<TModel, TModelDefaults, TSchema>,
  ) => string | number | null | undefined

  writeItem: (
    item: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>,
  ) => WrappedItem<TModel, TModelDefaults, TSchema>

  clearItem: (
    key: string | number,
  ) => void
}

export function createModelApi<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>(
  store: VueStore<TSchema, TModelDefaults>,
  model: ResolvedModel<TModel, TModelDefaults, TSchema>,
): VueModelApi<TModel, TModelDefaults, TSchema, WrappedItem<TModel, TModelDefaults, TSchema>> {
  type Api = VueModelApi<TModel, TModelDefaults, TSchema, WrappedItem<TModel, TModelDefaults, TSchema>>
  const api: Api = {
    peekFirst: findOptions => peekFirst({
      store,
      model,
      findOptions: toValue(findOptions),
      force: true,
    }).result,

    findFirst: findOptions => findFirst({
      store,
      model,
      findOptions: toValue(findOptions),
    }).then(r => r.result),

    queryFirst: options => createQuery<TModel, TModelDefaults, TSchema, any, WrappedItem<TModel, TModelDefaults, TSchema> | null>({
      store,
      fetchMethod: (options, meta) => findFirst({ store, model, findOptions: options!, meta }).then(r => r.result),
      cacheMethod: (options, meta) => peekFirst({ store, model, findOptions: options!, meta, force: true }).result,
      defaultValue: null,
      options,
    }),

    peekMany: findOptions => peekMany({
      store,
      model,
      findOptions: toValue(findOptions),
      force: true,
    }).result,

    findMany: findOptions => findMany({
      store,
      model,
      findOptions: toValue(findOptions),
    }).then(r => r.result),

    queryMany: options => createQuery<TModel, TModelDefaults, TSchema, any, Array<WrappedItem<TModel, TModelDefaults, TSchema>>>({
      store,
      fetchMethod: (options, meta) => findMany({ store, model, findOptions: options, meta }).then(r => r.result),
      cacheMethod: (options, meta) => peekMany({ store, model, findOptions: options, meta, force: true }).result,
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
      return createFormObject<
        ResolvedModelItem<TModel, TModelDefaults, TSchema>
      >({
        defaultValues: formOptions?.defaultValues,
        schema: formOptions?.schema ?? model.formSchema.create,
        submit: data => api.create(data),
      }) as TReturn
    },

    update: (item, updateOptions) => updateItem({
      store,
      model,
      item,
      key: updateOptions?.key,
    }),

    updateForm: async (options, formOptions) => {
      async function getFormData(): Promise<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>> {
        const item = await api.findFirst(options)

        if (!item) {
          throw new Error('Item not found')
        }

        return pickNonSpecialProps(item)
      }

      const initialData = await getFormData()

      const form = createFormObject<
        ResolvedModelItem<TModel, TModelDefaults, TSchema>
      >({
        defaultValues: () => ({
          ...formOptions?.defaultValues?.() as Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>,
          ...initialData,
        }),
        schema: formOptions?.schema ?? model.formSchema.update,
        resetDefaultValues: () => getFormData(),
        // Only use changed props
        transformData: (form) => {
          const data = {} as any
          for (const key in form.$changedProps) {
            data[key] = form[key]
          }
          return data
        },
        submit: data => api.update(data, {
          key: model.getKey(initialData),
        }),
      })
      return form
    },

    delete: (keyOrItem) => {
      let key: string | number | number
      if (typeof keyOrItem !== 'string' && typeof keyOrItem !== 'number') {
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

    subscribe: (keyOrFindOptions) => {
      if (store.$isServer) {
        return {
          unsubscribe: () => Promise.resolve(),
          meta: ref({}),
        }
      }

      const meta = ref<CustomHookMeta>({})

      let subscriptionId: string | undefined
      let previousKey: string | number | undefined
      let previousFindOptions: FindOptions<TModel, TModelDefaults, TSchema> | undefined

      async function unsub() {
        if (subscriptionId) {
          unsubscribe({
            store,
            meta: meta.value,
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

      async function sub(optionsValue: string | number | FindOptions<TModel, TModelDefaults, TSchema> | undefined) {
        await unsub()

        subscriptionId = crypto.randomUUID()

        const key = previousKey = typeof optionsValue === 'string' || typeof optionsValue === 'number' ? optionsValue : undefined
        const findOptions = previousFindOptions = typeof optionsValue === 'object' ? optionsValue : undefined

        await subscribe({
          store,
          meta: meta.value,
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
        meta,
      }
    },

    liveQueryFirst: (options) => {
      const { meta } = api.subscribe(options)
      const query = api.queryFirst(options)
      query.meta.value = meta.value
      return query
    },

    liveQueryMany: (options) => {
      const { meta } = api.subscribe(options)
      const query = api.queryMany(options)
      query.meta.value = meta.value
      return query
    },

    getKey: item => model.getKey(item),

    writeItem: (item) => {
      const key = model.getKey(item)
      if (!key) {
        throw new Error('Item write failed: key is not defined')
      }
      store.$cache.writeItem({
        model,
        key,
        item,
      })
      return store.$cache.readItem({
        model,
        key,
      })!
    },

    clearItem: (key) => {
      store.$cache.deleteItem({
        model,
        key,
      })
    },
  }
  return api
}
