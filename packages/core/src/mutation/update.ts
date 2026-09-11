import type { BatchCallConfig, CacheLayer, Collection, CollectionDefaults, CustomHookMeta, FormOperation, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'
import { resolveBatchCall } from '../batch'
import { isKeyDefined } from '../key'
import { peekFirst } from '../query'
import { finalizeMutation } from './finalizeMutation'
import { assertMutationAllowed, createMutationHookState, createOptimisticLayerLifecycle } from './optimistic'

export interface UpdateOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  key?: string | number | null
  skipCache?: boolean
  optimistic?: boolean | Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  /**
   * Form operations (op log) from a form submission.
   * Passed through to plugin hooks so they can handle relational edits.
   */
  formOperations?: FormOperation<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>[]

  /**
   * Whether this mutation should participate in batching.
   * Only applies when store-level batching is enabled.
   *
   * - `false` — opt out of batching
   * - `true` (or omitted) — join the default group
   * - `{ group: 'name' }` — join a specific batch group
   *
   * @default true
   */
  batch?: BatchCallConfig
}

export async function updateItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  item: inputItem,
  key,
  skipCache,
  optimistic = true,
  formOperations,
  batch,
}: UpdateOptions<TCollection, TCollectionDefaults, TSchema>): Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  const mutationHookState = createMutationHookState(store, collection, inputItem)
  const { transportItem } = mutationHookState

  key ??= collection.getKey(transportItem)

  if (!isKeyDefined(key)) {
    throw new Error('Item update failed: key is not defined')
  }

  assertMutationAllowed(store, collection, key, 'update')

  await store.$hooks.callHook('beforeMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'update',
    key,
    item: transportItem,
    modifyItem: mutationHookState.modifyItem,
    setItem: mutationHookState.setItem,
    formOperations: formOperations as FormOperation[],
  })

  let result: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | null = skipCache
    ? null
    : peekFirst({
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions: {
        key,
      },
    }).result

  if (result) {
    result = pickNonSpecialProps(result) as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
  }

  const optimisticLayer = createOptimisticLayerLifecycle(store)

  if (!skipCache && optimistic) {
    const layer: CacheLayer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: {
        [key]: {
          ...mutationHookState.optimisticItem,
          ...typeof optimistic === 'object' ? optimistic : {},
          $overrideKey: key,
        },
      },
      deletedItems: new Set(),
      optimistic: true,
    }

    optimisticLayer.add(layer)
  }

  try {
    // Batching: enqueue into batch scheduler if eligible
    const batchCall = resolveBatchCall(batch)
    if (store.$batch?.options.mutations && batchCall.enabled) {
      result = await store.$batch.enqueueUpdate(collection, key, transportItem, meta, batchCall.group, formOperations as FormOperation[]) as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
    }
    else {
      const abort = store.$hooks.withAbort({ explicit: true })
      await store.$hooks.callHook('updateItem', {
        store: store as unknown as GlobalStoreType,
        meta,
        collection,
        key,
        item: transportItem,
        getResult: () => result ?? undefined,
        setResult: (newResult, options) => {
          result = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
          if (result && options?.abort !== false) {
            abort()
          }
        },
        abort,
        formOperations: formOperations as FormOperation[],
      }, abort)
    }

    const commitResult = await finalizeMutation(store, {
      meta,
      collection,
      mutation: 'update',
      key,
      item: transportItem,
      result: result ?? undefined,
      skipCache,
      formOperations: formOperations as FormOperation[],
    }, {
      requireResultError: 'Item update failed: result is nullish',
      onBeforeApplyCache: optimisticLayer.remove,
    })

    result = commitResult.result as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    optimisticLayer.remove()
    throw error
  }

  return result as NonNullable<typeof result>
}
