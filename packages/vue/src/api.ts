import type { CreateOptions, DeleteOptions, UpdateOptions } from '@rstore/core'
import type { Collection, CollectionDefaults, CustomHookMeta, FindFirstOptions, FindManyOptions, FindOptions, HybridPromise, ResolvedCollection, ResolvedCollectionItem, ResolvedCollectionItemBase, StandardSchemaV1, StoreSchema, WrappedItem } from '@rstore/shared'
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

type QueryFirstOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema> | { enabled: false }

type QueryManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = FindManyOptions<TCollection, TCollectionDefaults, TSchema> | { enabled: false }

export interface QueryBuilder<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Create a reactive query for the first item that matches the given options.
   */
  first: (options: QueryFirstOptions<TCollection, TCollectionDefaults, TSchema>) => QueryFirstOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': 'first' }

  /**
   * Create a reactive query for all items that match the given options.
   */
  many: (() => { '~type': 'many' }) & ((options: QueryManyOptions<TCollection, TCollectionDefaults, TSchema>) => QueryManyOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': 'many' })
}

export interface LiveQueryBuilder<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Create a reactive live query for the first item that matches the given options and subscribe to real-time updates (for example from WebSockets).
   */
  first: (options: QueryFirstOptions<TCollection, TCollectionDefaults, TSchema>) => QueryFirstOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': 'first' }

  /**
   * Create a reactive live query for all items that match the given options and subscribe to real-time updates (for example from WebSockets).
   */
  many: (() => { '~type': 'many' }) & ((options: QueryManyOptions<TCollection, TCollectionDefaults, TSchema>) => QueryManyOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': 'many' })
}

export type SubscriptionQueryBuilder<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = <TOptions extends string | number | FindOptions<TCollection, TCollectionDefaults, TSchema> | undefined> (options: TOptions) => TOptions

export interface SubscribeResult {
  unsubscribe: () => Promise<void>
  meta: Ref<CustomHookMeta>
}

export type QueryResult<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TCollection, TCollectionDefaults, TSchema>,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType },
> = HybridPromise<
  TOptions extends { '~type': 'first' }
    ? VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TItem | null>
    : TOptions extends { '~type': 'many' }
      ? VueQueryReturn<TCollection, TCollectionDefaults, TSchema, Array<TItem>>
      : never
>

export type LiveQueryResult<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TCollection, TCollectionDefaults, TSchema>,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType },
> = HybridPromise<
  TOptions extends { '~type': 'first' }
    ? VueLiveQueryReturn<TCollection, TCollectionDefaults, TSchema, TItem | null>
    : TOptions extends { '~type': 'many' }
      ? VueLiveQueryReturn<TCollection, TCollectionDefaults, TSchema, Array<TItem>>
      : never
>

export interface VueCollectionApi<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TItem extends WrappedItem<TCollection, TCollectionDefaults, TSchema>,
> {
  /**
   * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
   *
   * Can be used in a computed property to read the cache reactively.
   *
   * @example
   * ```ts
   * const item = computed(() => store.MyCollection.peekFirst({ filter: { id: 1 } }))
   * ```
   */
  peekFirst: (
    options: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>,
  ) => WrappedItem<TCollection, TCollectionDefaults, TSchema> | null

  /**
   * Single-shot query to find the first item that matches the query in the cache without fetching the data from the adapter plugins. Result is **not** reactive, use `query` for reactive queries instead.
   */
  findFirst: (
    options: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>,
  ) => Promise<WrappedItem<TCollection, TCollectionDefaults, TSchema> | null>

  /**
   * Find all items that match the query in the cache without fetching the data from the adapter plugins.
   *
   * Can be used in a computed property to read the cache reactively.
   *
   * @example
   * ```ts
   * const items = computed(() => store.MyCollection.peekMany({ filter: { status: 'active' } }))
   * ```
   */
  peekMany: (
    options?: FindManyOptions<TCollection, TCollectionDefaults, TSchema> | undefined,
  ) => Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>

  /**
   * Single-shot query to find all items that match the query. Result is **not** reactive, use `query` for reactive queries instead.
   */
  findMany: (
    options?: FindManyOptions<TCollection, TCollectionDefaults, TSchema> | undefined,
  ) => Promise<Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>>

  /**
   * Create a reactive query that watches the given options and re-runs the query when the options change.
   *
   * The difference with `findFirst` and `findMany` is that `query` will return an object containing several reactive refs such as `data`, `loading`, and `error` instead of returning the data directly. This allows you to easily track the loading state and handle errors in your UI.
   */
  query: <TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType }> (
    optionsGetter: (queryBuilder: QueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions,
  ) => QueryResult<TCollection, TCollectionDefaults, TSchema, TItem, TOptions>

  /**
   * Create a reactive live query that watches the given options and re-runs the query when the options change. The query will also subscribe to real-time updates (for example from WebSockets).
   */
  liveQuery: <TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType }> (
    optionsGetter: (queryBuilder: LiveQueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions,
  ) => LiveQueryResult<TCollection, TCollectionDefaults, TSchema, TItem, TOptions>

  /**
   * Starts a subscription to real-time updates (for example from WebSockets) for the given item or query. No data is returned, you need to use `liveQuery` instead to get the actual data or use other methods to read the data from the cache.
   */
  subscribe: (
    optionsGetter: (queryBuilder: SubscriptionQueryBuilder<TCollection, TCollectionDefaults, TSchema>) => FindOptions<TCollection, TCollectionDefaults, TSchema>,
  ) => SubscribeResult

  /**
   * Create an item directly. For a more user-friendly way, use `createForm` instead.
   */
  create: (
    item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
    createOptions?: Pick<CreateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>
  ) => Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

  /**
   * (Recommended) The form object helps you creating a new item.
   */
  createForm: (
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       */
      defaultValues?: () => Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

      /**
       * Schema to validate the form object.
       *
       * @default collection.schema.create
       */
      schema?: StandardSchemaV1
    } & Pick<CreateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>,
  ) => VueCreateFormObject<TCollection, TCollectionDefaults, TSchema>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  update: (
    item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
    updateOptions?: Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'key' | 'optimistic'>,
  ) => Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

  /**
   * (Recommended) The form object helps you updating an existing item. If the item is not loaded yet, it will be fetched first to pre-fill the form.
   */
  updateForm: (
    options: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>,
    formOptions?: {
      /**
       * Default values set in the form object initially and when it is reset.
       *
       * By default `updateForm` will initialize the fields with the existing item data.
       */
      defaultValues?: () => Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

      /**
       * Schema to validate the form object.
       *
       * @default collection.schema.update
       */
      schema?: StandardSchemaV1
    } & Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>,
  ) => Promise<VueUpdateFormObject<TCollection, TCollectionDefaults, TSchema>>

  /**
   * Find all items that match the query.
   */
  delete: (
    keyOrItem: string | number | Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
    DeleteOptions?: Pick<DeleteOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'>,
  ) => Promise<void>

  getKey: (
    item: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>,
  ) => string | number | null | undefined

  writeItem: (
    item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>,
  ) => WrappedItem<TCollection, TCollectionDefaults, TSchema>

  clearItem: (
    key: string | number,
  ) => void
}

export function createCollectionApi<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: VueStore<TSchema, TCollectionDefaults>,
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
): VueCollectionApi<TCollection, TCollectionDefaults, TSchema, WrappedItem<TCollection, TCollectionDefaults, TSchema>> {
  /**
   * Bind the options getter to track the type of query (`first` or `many`).
   */
  function _bindQueryOptionsGetter<
    TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType },
    IsLive extends boolean,
  >(
    optionsGetter: IsLive extends false
      ? ((queryBuilder: QueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions)
      : ((queryBuilder: LiveQueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions),
    _live: IsLive,
  ) {
    const queryBuilder = {
      first: (options: QueryFirstOptions<TCollection, TCollectionDefaults, TSchema>) => ({
        ...typeof options === 'object' ? options : { key: options },
        '~type': 'first' satisfies QueryType,
      }),
      many: (options: QueryManyOptions<TCollection, TCollectionDefaults, TSchema> | undefined) => ({
        ...options,
        '~type': 'many' satisfies QueryType,
      }),
    } as QueryBuilder<TCollection, TCollectionDefaults, TSchema> & LiveQueryBuilder<TCollection, TCollectionDefaults, TSchema>
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
    boundOptionsGetter: () => FindOptions<TCollection, TCollectionDefaults, TSchema>
    type: MaybeRefOrGetter<QueryType>
  }) {
    return createQuery<TCollection, TCollectionDefaults, TSchema, any, WrappedItem<TCollection, TCollectionDefaults, TSchema> | null | Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>>({
      store,
      collection,
      fetchMethod: (options, meta) => toValue(type) === 'first'
        ? findFirst({ store, collection, findOptions: options!, meta }).then(r => r.result)
        : findMany({ store, collection, findOptions: options, meta }).then(r => r.result),
      cacheMethod: (options, meta) => toValue(type) === 'first'
        ? peekFirst({ store, collection, findOptions: options!, meta, force: true }).result
        : peekMany({ store, collection, findOptions: options, meta, force: true }).result,
      defaultValue: () => toValue(type) === 'first' ? null : [],
      options: boundOptionsGetter,
      name: type,
    })
  }

  /**
   * Create a subscription and manage its lifecycle. Automatically unsubscribe when the component is unmounted and re-subscribe when the options change.
   */
  function _subscribe(keyOrFindOptions?: MaybeRefOrGetter<string | number | FindOptions<TCollection, TCollectionDefaults, TSchema> | undefined>) {
    if (store.$isServer) {
      return {
        unsubscribe: () => Promise.resolve(),
        meta: ref<CustomHookMeta>({}),
      }
    }

    const meta = ref<CustomHookMeta>({})

    let subscriptionId: string | undefined
    let previousKey: string | number | undefined
    let previousFindOptions: FindOptions<TCollection, TCollectionDefaults, TSchema> | undefined

    async function unsub() {
      if (subscriptionId) {
        unsubscribe({
          store,
          meta: meta.value,
          collection,
          subscriptionId,
          key: previousKey,
          findOptions: previousFindOptions,
        })
        subscriptionId = undefined
        previousKey = undefined
        previousFindOptions = undefined
      }
    }

    async function sub(optionsValue: string | number | FindOptions<TCollection, TCollectionDefaults, TSchema> | undefined) {
      await unsub()

      subscriptionId = crypto.randomUUID()

      const key = previousKey = typeof optionsValue === 'string' || typeof optionsValue === 'number' ? optionsValue : undefined
      const findOptions = previousFindOptions = typeof optionsValue === 'object' ? optionsValue : undefined

      await subscribe({
        store,
        meta: meta.value,
        collection,
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
    TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema> & { '~type': QueryType },
    IsLive extends boolean,
  >(
    optionsGetter: IsLive extends false
      ? ((queryBuilder: QueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions)
      : ((queryBuilder: LiveQueryBuilder<TCollection, TCollectionDefaults, TSchema>) => TOptions),
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

  type Api = VueCollectionApi<TCollection, TCollectionDefaults, TSchema, WrappedItem<TCollection, TCollectionDefaults, TSchema>>
  const api: Api = {
    peekFirst: findOptions => peekFirst({
      store,
      collection,
      findOptions,
      force: true,
    }).result,

    findFirst: findOptions => findFirst({
      store,
      collection,
      findOptions,
    }).then(r => r.result),

    peekMany: findOptions => peekMany({
      store,
      collection,
      findOptions,
      force: true,
    }).result,

    findMany: findOptions => findMany({
      store,
      collection,
      findOptions,
    }).then(r => r.result),

    query: optionsGetter => _query(optionsGetter, false),

    liveQuery: optionsGetter => _query(optionsGetter, true),

    subscribe: optionsGetter => _subscribe(optionsGetter(c => c)),

    create: (item, options) => createItem({
      ...options,
      store,
      collection,
      item,
    }),

    createForm: (formOptions) => {
      type TReturn = ReturnType<Api['createForm']>
      return createFormObject<
        ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
      >({
        defaultValues: formOptions?.defaultValues,
        schema: formOptions?.schema ?? collection.formSchema.create,
        submit: data => api.create(data, {
          optimistic: formOptions?.optimistic,
        }),
      }) as TReturn
    },

    update: (item, updateOptions) => updateItem({
      ...updateOptions,
      store,
      collection,
      item,
    }),

    updateForm: async (options, formOptions) => {
      async function getFormData(): Promise<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> {
        const item = await api.findFirst(options)

        if (!item) {
          throw new Error('Item not found')
        }

        return pickNonSpecialProps(item, true)
      }

      const initialData = await getFormData()

      const form = createFormObject<
        ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
      >({
        defaultValues: () => ({
          ...formOptions?.defaultValues?.() as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
          ...initialData,
        }),
        schema: formOptions?.schema ?? collection.formSchema.update,
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
          key: collection.getKey(initialData),
          optimistic: formOptions?.optimistic,
        }),
      })
      return form
    },

    delete: (keyOrItem, options) => {
      let key: string | number | number
      if (typeof keyOrItem !== 'string' && typeof keyOrItem !== 'number') {
        const result = collection.getKey(keyOrItem)
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
        collection,
        key,
      })
    },

    getKey: item => collection.getKey(item),

    writeItem: (item) => {
      const key = collection.getKey(item)
      if (!key) {
        throw new Error('Item write failed: key is not defined')
      }
      store.$cache.writeItem({
        collection,
        key,
        item,
      })
      return store.$cache.readItem({
        collection,
        key,
      })!
    },

    clearItem: (key) => {
      store.$cache.deleteItem({
        collection,
        key,
      })
    },
  }
  return api
}
