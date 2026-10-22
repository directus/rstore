import type { Collection, CollectionDefaults, CollectionMutationType, GlobalStoreType, MutateCallback, MutateOptions, ResolvedCollectionItemBase, StoreCore, StoreSchema } from '@rstore/shared'
import { getMutationItemKey, isMutationItemEntry, pickNonSpecialProps, set, unwrapMutationItem } from '@rstore/shared'
import { isKeyDefined } from '../key'
import { reportOperationError } from '../utils/operationError'
import { finalizeMutation } from './finalizeMutation'

/** Run custom remote work through rstore's collection mutation lifecycle. */
export async function mutate<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TResult,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: MutateOptions<TCollection, TCollectionDefaults, TSchema>,
  callback: MutateCallback<TCollection, TCollectionDefaults, TSchema, TResult>,
): Promise<TResult> {
  const operation = {}
  const meta = options.meta ?? {}
  const many = isManyMutation(options)
  // Execution updates this detached context after item preparation/hooks, so
  // errors name the same effective target supplied to custom remote work.
  const execution = { key: options.key }
  try {
    return await (many
      ? mutateMany(store, { ...options, meta }, callback, operation)
      : mutateSingle(store, { ...options, meta }, callback, execution, operation))
  }
  catch (error) {
    await reportOperationError(store.$hooks, 'mutationError', {
      operation,
      store: store as unknown as GlobalStoreType,
      meta,
      collection: options.collection,
      mutation: options.mutation,
      many,
      key: execution.key,
      item: options.item,
      keys: options.keys,
      items: options.items,
      error,
    })
    throw error
  }
}

/** Run one custom mutation while preserving its effective error target. */
async function mutateSingle<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TResult,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: MutateOptions<TCollection, TCollectionDefaults, TSchema>,
  callback: MutateCallback<TCollection, TCollectionDefaults, TSchema, TResult>,
  execution: { key: string | number | undefined },
  operation: object,
): Promise<TResult> {
  const meta = options.meta ?? {}
  let item = prepareSingleItem(store, options)
  let key = options.key ?? getItemKey(options, item)
  execution.key = normalizeKey(key)

  await store.$hooks.callHook('beforeMutation', {
    operation,
    store: store as unknown as GlobalStoreType,
    meta,
    collection: options.collection,
    key: normalizeKey(key),
    item,
    modifyItem: (path: any, value: any) => {
      item ??= {} as Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem as Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    },
    mutation: options.mutation,
    formOperations: options.formOperations,
  })

  key = options.key ?? getItemKey(options, item)
  execution.key = normalizeKey(key)

  const callbackResult = await callback({
    store: store as unknown as GlobalStoreType,
    meta,
    collection: options.collection,
    mutation: options.mutation,
    key: normalizeKey(key),
    item,
  })

  const finalizeResult = await finalizeMutation(store, {
    ...options,
    operation,
    meta,
    key: normalizeKey(key),
    item,
    result: callbackResult as any,
  }, getRuntimeOptions(options.mutation, options.skipCache))

  return (finalizeResult.result ?? callbackResult) as TResult
}

async function mutateMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TResult,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: MutateOptions<TCollection, TCollectionDefaults, TSchema>,
  callback: MutateCallback<TCollection, TCollectionDefaults, TSchema, TResult>,
  operation: object,
): Promise<TResult> {
  const meta = options.meta ?? {}
  let items = options.items?.map(item => prepareManyItem(store, options, item))

  await store.$hooks.callHook('beforeManyMutation', {
    operation,
    store: store as unknown as GlobalStoreType,
    meta,
    collection: options.collection,
    keys: options.keys,
    items: items as any,
    mutation: options.mutation,
    setItems: (newItems) => {
      items = newItems as typeof items
    },
  })

  const keys = options.keys ?? getItemKeys(options, items)

  const callbackResult = await callback({
    store: store as unknown as GlobalStoreType,
    meta,
    collection: options.collection,
    mutation: options.mutation,
    keys,
    items,
  })

  const finalizeResult = await finalizeMutation(store, {
    ...options,
    operation,
    meta,
    keys,
    items,
    results: getManyResults(callbackResult),
  }, getRuntimeOptions(options.mutation, options.skipCache))

  return (finalizeResult.results ?? callbackResult) as TResult
}

function isManyMutation(options: MutateOptions) {
  return options.many === true || options.keys != null || options.items != null
}

function prepareSingleItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: MutateOptions<TCollection, TCollectionDefaults, TSchema>,
) {
  if (!options.item || options.mutation === 'delete') {
    return options.item
  }

  const item = pickNonSpecialProps(options.item, true) as Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  store.$processItemSerialization(options.collection, item)
  return item
}

function prepareManyItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: MutateOptions<TCollection, TCollectionDefaults, TSchema>,
  item: NonNullable<MutateOptions<TCollection, TCollectionDefaults, TSchema>['items']>[number],
) {
  if (options.mutation === 'delete') {
    return item
  }

  const value = pickNonSpecialProps(unwrapMutationItem(item), true) as Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  store.$processItemSerialization(options.collection, value)
  return isMutationItemEntry(item) ? { ...item, item: value } : value
}

function getRuntimeOptions(mutation: CollectionMutationType, skipCache: boolean | undefined) {
  if (skipCache) {
    return {}
  }

  return {
    requireResultError: mutation === 'create'
      ? 'Item creation failed: result is nullish'
      : mutation === 'update'
        ? 'Item update failed: result is nullish'
        : undefined,
    missingCacheKeyError: mutation === 'create'
      ? 'Item creation failed: key is not defined'
      : mutation === 'update'
        ? 'Item update failed: key is not defined'
        : 'Item deletion failed: key is not defined',
  }
}

function getManyResults(result: unknown) {
  if (result == null) {
    return []
  }
  return Array.isArray(result) ? result : [result]
}

function getItemKeys(options: MutateOptions, items: MutateOptions['items']) {
  const keys = items
    ?.map(item => getMutationItemKey(item) ?? getItemKey(options, item))
    .filter(isKeyDefined)
  return keys?.length ? keys : undefined
}

function getItemKey(options: MutateOptions, item: unknown) {
  if (!item || typeof item !== 'object') {
    return undefined
  }
  return options.collection.getKey(isMutationItemEntry(item) ? item.item : item)
}

function normalizeKey(key: string | number | null | undefined) {
  return key ?? undefined
}
