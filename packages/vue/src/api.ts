import type { CreateOptions, DeleteOptions, UpdateOptions } from '@rstore/core'
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

export type QueryType = 'first' | 'many'

export interface QueryBuilder<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Create a reactive query for the first item that matches the given options.
   */
  first: (options: string | number | FindFirstOptions<TModel, TModelDefaults, TSchema> | { enabled: false }) => (FindFirstOptions<TModel, TModelDefaults, TSchema> | { enabled: false }) & { '~type': 'first' }

  /**
   * Create a reactive query for all items that match the given options.
   */
  many: (options?: FindManyOptions<TModel, TModelDefaults, TSchema> | undefined | { enabled: false }) => (FindManyOptions<TModel, TModelDefaults, TSchema> | Record<PropertyKey, never> | { enabled: false }) & { '~type': 'many' }
}

export interface LiveQueryBuilder<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Create a reactive live query for the first item that matches the given options and subscribe to real-time updates (for example from WebSockets).
   */
  first: (options: string | number | FindFirstOptions<TModel, TModelDefaults, TSchema> | { enabled: false }) => (FindFirstOptions<TModel, TModelDefaults, TSchema> | { enabled: false }) & { '~type': 'first' }

  /**
   * Create a reactive live query for all items that match the given options and subscribe to real-time updates (for example from WebSockets).
   */
  many: (options?: FindManyOptions<TModel, TModelDefaults, TSchema> | undefined | { enabled: false }) => (FindManyOptions<TModel, TModelDefaults, TSchema> | Record<PropertyKey, never> | { enabled: false }) & { '~type': 'many' }
}

export type SubscriptionQueryBuilder<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = <TOptions extends string | number | FindOptions<TModel, TModelDefaults, TSchema> | undefined> (options: TOptions) => TOptions

export interface SubscribeResult {
  unsubscribe: () => Promise<void>
  meta: Ref<CustomHookMeta>
}

export type QueryResult<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TModel, TModelDefaults, TSchema>,
  TOptions extends FindOptions<TModel, TModelDefaults, TSchema> & { '~type': QueryType },
> = HybridPromise<
  TOptions extends { '~type': 'first' }
    ? VueQueryReturn<TModel, TModelDefaults, TSchema, TItem | null>
    : TOptions extends { '~type': 'many' }
      ? VueQueryReturn<TModel, TModelDefaults, TSchema, Array<TItem>>
      : never
>

export type LiveQueryResult<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TModel, TModelDefaults, TSchema>,
  TOptions extends FindOptions<TModel, TModelDefaults, TSchema> & { '~type': QueryType },
> = HybridPromise<
  TOptions extends { '~type': 'first' }
    ? VueLiveQueryReturn<TModel, TModelDefaults, TSchema, TItem | null>
    : TOptions extends { '~type': 'many' }
      ? VueLiveQueryReturn<TModel, TModelDefaults, TSchema, Array<TItem>>
      : never
>

export interface VueModelApi<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TModel, TModelDefaults, TSchema>,
> {
  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   *
   * Can be used in a computed property to read the cache reactively.
   *
   * @example
   * ```ts
   * const item = computed(() => store.MyModel.peekFirst({ filter: { id: 1 } }))
   * ```
   */
  peekFirst: (
    options: string | number | FindFirstOptions<TModel, TModelDefaults, TSchema>,
  ) => WrappedItem<TModel, TModelDefaults, TSchema> | null

  /**
   * Single-shot query to find the first item that matches the query in the cache without fetching the data from the adapter plugins. Result is **not** reactive, use `query` for reactive queries instead.
   */
  findFirst: (
    options: string | number | FindFirstOptions<TModel, TModelDefaults, TSchema>,
  ) => Promise<WrappedItem<TModel, TModelDefaults, TSchema> | null>

  /**
   * Find all items that match the query in the cache without fetching the data from the adapter plugins.
   *
   * Can be used in a computed property to read the cache reactively.
   *
   * @example
   * ```ts
   * const items = computed(() => store.MyModel.peekMany({ filter: { status: 'active' } }))
   * ```
   */
  peekMany: (
    options?: FindManyOptions<TModel, TModelDefaults, TSchema> | undefined,
  ) => Array<WrappedItem<TModel, TModelDefaults, TSchema>>

  /**
   * Single-shot query to find all items that match the query. Result is **not** reactive, use `query` for reactive queries instead.
   */
  findMany: (
    options?: FindManyOptions<TModel, TModelDefaults, TSchema> | undefined,
  ) => Promise<Array<WrappedItem<TModel, TModelDefaults, TSchema>>>

  /**
   * Create a reactive query that watches the given options and re-runs the query when the options change.
   *
   * The difference with `findFirst` and `findMany` is that `query` will return an object containing several reactive refs such as `data`, `loading`, and `error` instead of returning the data directly. This allows you to easily track the loading state and handle errors in your UI.
   */
  query: <TOptions extends FindOptions<TModel, TModelDefaults, TSchema> & { '~type': QueryType }> (
    optionsGetter: (queryBuilder: QueryBuilder<TModel, TModelDefaults, TSchema>) => TOptions,
  ) => QueryResult<TModel, TModelDefaults, TSchema, TItem, TOptions>

  /**
   * Create a reactive live query that watches the given options and re-runs the query when the options change. The query will also subscribe to real-time updates (for example from WebSockets).
   */
  liveQuery: <TOptions extends FindOptions<TModel, TModelDefaults, TSchema> & { '~type': QueryType }> (
    optionsGetter: (queryBuilder: LiveQueryBuilder<TModel, TModelDefaults, TSchema>) => TOptions,
  ) => LiveQueryResult<TModel, TModelDefaults, TSchema, TItem, TOptions>

  /**
   * Starts a subscription to real-time updates (for example from WebSockets) for the given item or query. No data is returned, you need to use `liveQuery` instead to get the actual data or use other methods to read the data from the cache.
   */
  subscribe: (
    optionsGetter: (queryBuilder: SubscriptionQueryBuilder<TModel, TModelDefaults, TSchema>) => FindOptions<TModel, TModelDefaults, TSchema>,
  ) => SubscribeResult

  /**
   * Create an item directly. For a more user-friendly way, use `createForm` instead.
   */
  create: (
    item: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>,
    createOptions?: Pick<CreateOptions<TModel, TModelDefaults, TSchema>, 'optimistic'>
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
    } & Pick<CreateOptions<TModel, TModelDefaults, TSchema>, 'optimistic'>,
  ) => VueCreateFormObject<TModel, TModelDefaults, TSchema>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  update: (
    item: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>,
    updateOptions?: Pick<UpdateOptions<TModel, TModelDefaults, TSchema>, 'key' | 'optimistic'>,
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
    } & Pick<UpdateOptions<TModel, TModelDefaults, TSchema>, 'optimistic'>,
  ) => Promise<VueUpdateFormObject<TModel, TModelDefaults, TSchema>>

  /**
   * Find all items that match the query.
   */
  delete: (
    keyOrItem: string | number | Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>,
    DeleteOptions?: Pick<DeleteOptions<TModel, TModelDefaults, TSchema>, 'optimistic'>,
  ) => Promise<void>

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
  /**
   * Bind the options getter to track the type of query (`first` or `many`).
   */
  function _bindQueryOptionsGetter<
    TOptions extends FindOptions<TModel, TModelDefaults, TSchema> & { '~type': QueryType },
    IsLive extends boolean,
  >(
    optionsGetter: IsLive extends false
      ? ((queryBuilder: QueryBuilder<TModel, TModelDefaults, TSchema>) => TOptions)
      : ((queryBuilder: LiveQueryBuilder<TModel, TModelDefaults, TSchema>) => TOptions),
    _live: IsLive,
  ) {
    const queryBuilder = {
      first: options => ({
        ...typeof options === 'object' ? options : { key: options },
        '~type': 'first' satisfies QueryType,
      }),
      many: options => ({
        ...options,
        '~type': 'many' satisfies QueryType,
      }),
    } as QueryBuilder<TModel, TModelDefaults, TSchema> & LiveQueryBuilder<TModel, TModelDefaults, TSchema>
    const type = ref<QueryType>('first')
    const boundOptionsGetter = () => {
      const result = optionsGetter(queryBuilder)
      type.value = result['~type']
      return result
    }
    return {
      boundOptionsGetter,
      type,
    }
  }

  /**
   * Create a query with the given type and bound options getter.
   * @private
   */
  function _createQuery({
    boundOptionsGetter,
    type,
  }: {
    boundOptionsGetter: () => FindOptions<TModel, TModelDefaults, TSchema>
    type: MaybeRefOrGetter<QueryType>
  }) {
    return createQuery<TModel, TModelDefaults, TSchema, any, WrappedItem<TModel, TModelDefaults, TSchema> | null | Array<WrappedItem<TModel, TModelDefaults, TSchema>>>({
      store,
      model,
      fetchMethod: (options, meta) => toValue(type) === 'first'
        ? findFirst({ store, model, findOptions: options!, meta }).then(r => r.result)
        : findMany({ store, model, findOptions: options, meta }).then(r => r.result),
      cacheMethod: (options, meta) => toValue(type) === 'first'
        ? peekFirst({ store, model, findOptions: options!, meta, force: true }).result
        : peekMany({ store, model, findOptions: options, meta, force: true }).result,
      defaultValue: () => toValue(type) === 'first' ? null : [],
      options: boundOptionsGetter,
      name: type,
    })
  }

  /**
   * Create a subscription and manage its lifecycle. Automatically unsubscribe when the component is unmounted and re-subscribe when the options change.
   */
  function _subscribe(keyOrFindOptions?: MaybeRefOrGetter<string | number | FindOptions<TModel, TModelDefaults, TSchema> | undefined>) {
    if (store.$isServer) {
      return {
        unsubscribe: () => Promise.resolve(),
        meta: ref<CustomHookMeta>({}),
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
  }

  function _query<
    TOptions extends FindOptions<TModel, TModelDefaults, TSchema> & { '~type': QueryType },
    IsLive extends boolean,
  >(
    optionsGetter: IsLive extends false
      ? ((queryBuilder: QueryBuilder<TModel, TModelDefaults, TSchema>) => TOptions)
      : ((queryBuilder: LiveQueryBuilder<TModel, TModelDefaults, TSchema>) => TOptions),
    isLive: IsLive,
  ) {
    const { boundOptionsGetter, type } = _bindQueryOptionsGetter(optionsGetter, isLive)
    let meta: CustomHookMeta | undefined
    if (isLive) {
      const subResult = _subscribe(boundOptionsGetter())
      meta = subResult.meta.value
    }
    const query = _createQuery({
      boundOptionsGetter,
      type,
    })
    if (meta) {
      Object.assign(query.meta.value, meta)
    }
    return query as ReturnType<Api['query']>
  }

  type Api = VueModelApi<TModel, TModelDefaults, TSchema, WrappedItem<TModel, TModelDefaults, TSchema>>
  const api: Api = {
    peekFirst: findOptions => peekFirst({
      store,
      model,
      findOptions,
      force: true,
    }).result,

    findFirst: findOptions => findFirst({
      store,
      model,
      findOptions,
    }).then(r => r.result),

    peekMany: findOptions => peekMany({
      store,
      model,
      findOptions,
      force: true,
    }).result,

    findMany: findOptions => findMany({
      store,
      model,
      findOptions,
    }).then(r => r.result),

    query: optionsGetter => _query(optionsGetter, false),

    liveQuery: optionsGetter => _query(optionsGetter, true),

    subscribe: optionsGetter => _subscribe(optionsGetter(c => c)),

    create: (item, options) => createItem({
      ...options,
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
        submit: data => api.create(data, {
          optimistic: formOptions?.optimistic,
        }),
      }) as TReturn
    },

    update: (item, updateOptions) => updateItem({
      ...updateOptions,
      store,
      model,
      item,
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
          optimistic: formOptions?.optimistic,
        }),
      })
      return form
    },

    delete: (keyOrItem, options) => {
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
        ...options,
        store,
        model,
        key,
      })
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
