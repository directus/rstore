import type { ApplyMutationOptions, ApplyMutationResult, Collection, CollectionDefaults, FinalizeMutationOptions, FinalizeMutationResult, GlobalStoreType, ResolvedCollectionItemBase, StoreCore, StoreSchema } from '@rstore/shared'
import { getMutationItemKey, isMutationItemEntry, unwrapMutationItem } from '@rstore/shared'
import { unwrapItem } from '../../item'
import { isKeyDefined } from '../../key'
import { validateCommittedCacheKeys } from './validation'

export interface FinalizeMutationRuntimeOptions {
  emitItemHooks?: boolean
  missingCacheKeyError?: string
  requireResultError?: string
  onBeforeApplyCache?: () => void
}

export async function emitItemAfterMutationHooks<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  meta: NonNullable<FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>['meta']>,
  results: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>,
) {
  if (options.mutation === 'delete') {
    await Promise.all(getSingleHookEntries(options, results).map(entry =>
      emitAfterMutationHook(store, options, meta, entry),
    ))
    return results
  }

  const nextResults = await Promise.all(getSingleHookEntries(options, results).map(entry =>
    emitAfterMutationHook(store, options, meta, entry),
  ))

  return nextResults.filter(isCommittedResult)
}

export async function emitAfterMutationHook<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  meta: NonNullable<FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>['meta']>,
  entry: SingleHookEntry<TCollection, TCollectionDefaults, TSchema>,
) {
  let result = entry.result
  await store.$hooks.callHook('afterMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection: options.collection,
    key: entry.key,
    item: entry.item,
    mutation: options.mutation,
    getResult: () => result ?? undefined,
    setResult: (newResult) => {
      result = newResult as ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
    },
    formOperations: options.formOperations,
  })
  return result
}

export function applyCommittedMutation<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  applyOptions: ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  finalizeOptions: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  runtimeOptions: FinalizeMutationRuntimeOptions,
): ApplyMutationResult {
  if (finalizeOptions.skipCache) {
    return emptyApplyMutationResult()
  }

  runtimeOptions.onBeforeApplyCache?.()
  validateCommittedCacheKeys(applyOptions, runtimeOptions.missingCacheKeyError)

  return store.$cache.applyMutation(applyOptions)
}

export function createSingleApplyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  meta: NonNullable<FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>['meta']>,
  result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined,
): ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema> {
  const applyOptions: ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema> = {
    collection: options.collection,
    mutation: options.mutation,
    meta,
    fieldTimestamps: options.fieldTimestamps,
    deletedAt: options.deletedAt,
  }
  if (isKeyDefined(options.key)) {
    applyOptions.key = options.key
  }
  if (result !== undefined) {
    applyOptions.result = result
  }
  else if (options.mutation === 'delete' && options.item !== undefined) {
    applyOptions.item = options.item
  }
  return applyOptions
}

export function createManyApplyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  meta: NonNullable<FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>['meta']>,
  results: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>,
): ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema> {
  const applyOptions: ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema> = {
    collection: options.collection,
    mutation: options.mutation,
    meta,
    fieldTimestamps: options.fieldTimestamps,
    deletedAt: options.deletedAt,
  }
  if (isKeyDefined(options.key)) {
    applyOptions.key = options.key
  }
  if (options.keys) {
    applyOptions.keys = options.keys
  }
  if (results.length) {
    applyOptions.results = results
  }
  else if (options.mutation === 'delete' && options.items) {
    applyOptions.items = options.items
  }
  return applyOptions
}

export function getInitialManyResults<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>) {
  if (options.results) {
    return options.results
  }
  return options.result ? [options.result] : []
}

export function getHookItems(options: FinalizeMutationOptions, results: Array<ResolvedCollectionItemBase<any, any, any>>) {
  if (options.items) {
    return options.items.map((item, index) => {
      if (isMutationItemEntry(item)) {
        return {
          key: normalizeKey(item.key ?? getItemKey(options, item.item)),
          item: item.item,
        }
      }
      return {
        key: normalizeKey(options.keys?.[index] ?? getItemKey(options, item)),
        item,
      }
    })
  }
  if (!results.length) {
    return undefined
  }
  return results.map(item => ({
    key: normalizeKey(getItemKey(options, item)),
    item,
  }))
}

export function getHookKeys(options: FinalizeMutationOptions, results: Array<ResolvedCollectionItemBase<any, any, any>>) {
  if (options.keys) {
    return options.keys
  }
  if (options.items) {
    return getDefinedKeys(options.items.map(item => getMutationItemKey(item) ?? getItemKey(options, item)))
  }
  return getDefinedKeys(results.map(item => getItemKey(options, item)))
}

export function parseCommittedItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  collection: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>['collection'],
  item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>,
) {
  const unwrapped = unwrapItem(item as any) as ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
  if (!isWrappedItem(item)) {
    store.$processItemParsing(collection, unwrapped)
  }
  return unwrapped
}

export function withSingleResult<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  applyResult: ApplyMutationResult,
  result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined,
): FinalizeMutationResult<TCollection, TCollectionDefaults, TSchema> {
  return result === undefined ? applyResult : { ...applyResult, result }
}

export function withManyResults<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  applyResult: ApplyMutationResult,
  results: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>,
): FinalizeMutationResult<TCollection, TCollectionDefaults, TSchema> {
  return results.length ? { ...applyResult, results } : applyResult
}

export function getItemKey(options: FinalizeMutationOptions, item: unknown) {
  if (!item || typeof item !== 'object') {
    return undefined
  }
  return options.collection.getKey(isMutationItemEntry(item) ? item.item : item)
}

export function normalizeKey(key: string | number | null | undefined) {
  return key ?? undefined
}

interface SingleHookEntry<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  key?: string | number
  item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  result?: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | null
}

function getSingleHookEntries<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  results: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>,
) {
  const length = Math.max(options.keys?.length ?? 0, options.items?.length ?? 0, results.length)
  return Array.from({ length }, (_, index): SingleHookEntry<TCollection, TCollectionDefaults, TSchema> => {
    const sourceItem = options.items?.[index]
    const item = sourceItem === undefined ? undefined : unwrapMutationItem(sourceItem)
    const result = results[index]
    return {
      key: normalizeKey(options.keys?.[index] ?? getMutationItemKey(sourceItem) ?? getItemKey(options, result ?? item)),
      item: item as Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | undefined,
      result,
    }
  })
}

function getDefinedKeys(keys: Array<string | number | null | undefined>) {
  const definedKeys = keys.filter(isKeyDefined)
  return definedKeys.length ? definedKeys : undefined
}

function isWrappedItem(item: unknown) {
  return !!item && typeof item === 'object' && typeof (item as { $raw?: unknown }).$raw === 'function'
}

function isCommittedResult<T>(item: T | null | undefined): item is T {
  return item != null
}

function emptyApplyMutationResult(): ApplyMutationResult {
  return { written: [], deleted: [], skipped: 0 }
}
