import type { Collection, CollectionDefaults, ResolvedCollectionItem, ResolvedCollectionItemBase, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CreateCollectionApiOptions, VueCollectionApi } from './types'
import { createItem, createMany, deleteItem, deleteMany, findFirst, findMany, isKeyDefined, peekFirst, peekMany, updateItem, updateMany } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { createFormObject } from '../form'
import { runApiQuery, subscribeToApiQuery } from './query'

export function createCollectionApi<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  {
    store,
    getCollection,
    onInvalidate,
  }: CreateCollectionApiOptions<TCollection, TCollectionDefaults, TSchema>,
): VueCollectionApi<TCollection, TCollectionDefaults, TSchema, WrappedItem<TCollection, TCollectionDefaults, TSchema>> {
  type Api = VueCollectionApi<TCollection, TCollectionDefaults, TSchema, WrappedItem<TCollection, TCollectionDefaults, TSchema>>
  const runtime = { store, getCollection, onInvalidate }
  const api: Api = {
    peekFirst: findOptions => peekFirst({ store, collection: getCollection(), findOptions, force: true }).result,
    findFirst: findOptions => findFirst({ store, collection: getCollection(), findOptions }).then(r => r.result),
    peekMany: findOptions => peekMany({ store, collection: getCollection(), findOptions, force: true }).result,
    findMany: findOptions => findMany({ store, collection: getCollection(), findOptions }).then(r => r.result),
    query: optionsGetter => runApiQuery(runtime, optionsGetter, false) as ReturnType<Api['query']>,
    liveQuery: optionsGetter => runApiQuery(runtime, optionsGetter, true) as ReturnType<Api['liveQuery']>,
    subscribe: optionsGetter => subscribeToApiQuery(runtime, optionsGetter(c => c)),
    create: (item, options) => createItem({ ...options, store, collection: getCollection(), item }),
    createMany: (items, options) => createMany({ ...options, store, collection: getCollection(), items }),
    createForm: formOptions => createCreateForm(api, getCollection, store, formOptions),
    update: (item, updateOptions) => updateItem({ ...updateOptions, store, collection: getCollection(), item }),
    updateMany: (items, options) => updateMany({ ...options, store, collection: getCollection(), items }),
    updateForm: (options, formOptions) => createUpdateForm(api, getCollection, store, options, formOptions),
    delete: (keyOrItem, options) => deleteOne(store, getCollection(), keyOrItem, options),
    deleteMany: (keysOrItems, options) => deleteManyItems(store, getCollection(), keysOrItems, options),
    getKey: item => getCollection().getKey(item),
    writeItem: item => writeItem(store, getCollection(), item),
    clearItem: key => store.$cache.deleteItem({ collection: getCollection(), key }),
  }
  return api
}

/**
 * Create a form for a new collection item.
 */
function createCreateForm(api: any, getCollection: () => any, store: any, formOptions: any) {
  return createFormObject({
    defaultValues: formOptions?.defaultValues,
    schema: formOptions?.schema ?? getCollection().formSchema.create,
    submit: (data, { formOperations }) => api.create(data, {
      optimistic: formOptions?.optimistic,
      formOperations,
    }),
    resetOnSuccess: formOptions?.resetOnSuccess,
    validateOnSubmit: formOptions?.validateOnSubmit,
    transformData: formOptions?.transformData,
    collection: getCollection(),
    store,
  }) as ReturnType<typeof api.createForm>
}

/**
 * Create a form for an existing collection item.
 */
async function createUpdateForm(api: any, getCollection: () => any, store: any, options: any, formOptions: any) {
  async function getDefaultValues(): Promise<ResolvedCollectionItemBase<any, any, any>> {
    const item = await api.findFirst(options)
    if (!item) {
      throw new Error('Item not found')
    }
    return {
      ...pickNonSpecialProps(item, true),
      ...formOptions?.defaultValues?.() as Partial<ResolvedCollectionItem<any, any, any>>,
    }
  }

  const initialData = await getDefaultValues()
  return createFormObject({
    defaultValues: () => initialData,
    schema: formOptions?.schema ?? getCollection().formSchema.update,
    resetDefaultValues: getDefaultValues,
    transformData: form => transformUpdateFormData(form, formOptions),
    submit: (data, { formOperations }) => api.update(data, {
      key: getCollection().getKey(initialData),
      optimistic: formOptions?.optimistic,
      formOperations,
    }),
    resetOnSuccess: formOptions?.resetOnSuccess,
    validateOnSubmit: formOptions?.validateOnSubmit,
    collection: getCollection(),
    store,
  }) as ReturnType<typeof api.updateForm>
}

/**
 * Transform update form data using changed fields by default.
 */
function transformUpdateFormData(form: any, formOptions: any) {
  let data = {} as any
  if (formOptions?.pickOnlyChanged ?? true) {
    for (const key in form.$changedProps) {
      data[key] = form[key]
    }
  }
  else {
    data = { ...form }
  }
  return formOptions?.transformData ? formOptions.transformData(data) : data
}

/**
 * Delete one item by key or item object.
 */
function deleteOne(store: any, collection: any, keyOrItem: any, options: any) {
  const key = resolveDeleteKey(collection, keyOrItem)
  return deleteItem({ ...options, store, collection, key })
}

/**
 * Delete many items by keys or item objects.
 */
function deleteManyItems(store: any, collection: any, keysOrItems: any[], options: any) {
  const keys = keysOrItems.map(keyOrItem => resolveDeleteKey(collection, keyOrItem))
  return deleteMany({ ...options, store, collection, keys })
}

/**
 * Resolve a delete target to a defined primary key.
 */
function resolveDeleteKey(collection: any, keyOrItem: any) {
  if (typeof keyOrItem === 'string' || typeof keyOrItem === 'number') {
    return keyOrItem
  }
  const result = collection.getKey(keyOrItem)
  if (!isKeyDefined(result)) {
    throw new Error('Item delete failed: key is not defined')
  }
  return result
}

/**
 * Write an item directly to cache and return the wrapped item.
 */
function writeItem(store: any, collection: any, item: any) {
  const key = collection.getKey(item)
  if (!isKeyDefined(key)) {
    throw new Error('Item write failed: key is not defined')
  }
  store.$cache.writeItem({ collection, key, item })
  return store.$cache.readItem({ collection, key })!
}
