import type { Collection, CollectionDefaults, FinalizeMutationOptions, FinalizeMutationResult, GlobalStoreType, ResolvedCollectionItemBase, StoreCore, StoreSchema } from '@rstore/shared'
import type { FinalizeMutationRuntimeOptions } from './finalize/helpers'
import { applyCommittedMutation, createManyApplyOptions, createSingleApplyOptions, emitAfterMutationHook, emitItemAfterMutationHooks, getHookItems, getHookKeys, getInitialManyResults, getItemKey, normalizeKey, parseCommittedItem, withManyResults, withSingleResult } from './finalize/helpers'

/** Shared finalize path used after a remote mutation succeeds. */
export async function finalizeMutation<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  runtimeOptions: FinalizeMutationRuntimeOptions = {},
): Promise<FinalizeMutationResult<TCollection, TCollectionDefaults, TSchema>> {
  return isManyFinalize(options)
    ? finalizeManyMutation(store, options, runtimeOptions)
    : finalizeSingleMutation(store, options, runtimeOptions)
}

async function finalizeSingleMutation<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  runtimeOptions: FinalizeMutationRuntimeOptions,
): Promise<FinalizeMutationResult<TCollection, TCollectionDefaults, TSchema>> {
  const meta = options.meta ?? {}
  let result = options.result as ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | null | undefined

  result = await emitAfterMutationHook(store, options, meta, {
    key: normalizeKey(options.key ?? getItemKey(options, result ?? options.item)),
    item: options.item,
    result,
  })

  if (runtimeOptions.requireResultError && result == null) {
    throw new Error(runtimeOptions.requireResultError)
  }

  const parsedResult = result != null ? parseCommittedItem(store, options.collection, result) : undefined
  const applyOptions = createSingleApplyOptions(options, meta, parsedResult)
  const applyResult = applyCommittedMutation(store, applyOptions, options, runtimeOptions)

  store.$mutationHistory.push({
    operation: options.mutation,
    collection: options.collection,
    key: normalizeKey(options.key ?? getItemKey(options, parsedResult ?? options.item)),
    payload: options.item,
  })

  return withSingleResult(applyResult, parsedResult)
}

async function finalizeManyMutation<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  options: FinalizeMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  runtimeOptions: FinalizeMutationRuntimeOptions,
): Promise<FinalizeMutationResult<TCollection, TCollectionDefaults, TSchema>> {
  const meta = options.meta ?? {}
  let results = getInitialManyResults(options)

  if (runtimeOptions.emitItemHooks) {
    results = await emitItemAfterMutationHooks(store, options, meta, results)
  }

  await store.$hooks.callHook('afterManyMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection: options.collection,
    keys: getHookKeys(options, results),
    items: getHookItems(options, results) as any,
    mutation: options.mutation,
    getResult: () => results,
    setResult: (newResults) => {
      results = newResults as Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    },
  })

  const parsedResults = results.map(item => parseCommittedItem(store, options.collection, item))
  const applyOptions = createManyApplyOptions(options, meta, parsedResults)
  const applyResult = applyCommittedMutation(store, applyOptions, options, runtimeOptions)

  store.$mutationHistory.push({
    operation: options.mutation,
    collection: options.collection,
    keys: getHookKeys(options, parsedResults),
    payload: options.items as any,
  })

  return withManyResults(applyResult, parsedResults)
}

function isManyFinalize(options: FinalizeMutationOptions) {
  return options.keys != null || options.items != null || options.results != null
}
