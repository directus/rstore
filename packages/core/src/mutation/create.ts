import type { BatchCallConfig, CacheLayer, Collection, CollectionDefaults, CustomHookMeta, FormOperation, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps, set } from '@rstore/shared'
import { resolveBatchCall } from '../batch'
import { isKeyDefined } from '../key'
import { finalizeMutation } from './finalizeMutation'

export interface CreateOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
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

export async function createItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  item,
  skipCache,
  optimistic = true,
  formOperations,
  batch,
}: CreateOptions<TCollection, TCollectionDefaults, TSchema>): Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  const originalItem = item

  item = pickNonSpecialProps(item, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

  store.$processItemSerialization(collection, item)

  let result: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | undefined

  await store.$hooks.callHook('beforeMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'create',
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
    },
    formOperations: formOperations as FormOperation[],
  })

  let layer: CacheLayer | undefined
  const removeOptimisticLayer = () => {
    if (layer) {
      store.$cache.removeLayer(layer.id)
      layer = undefined
    }
  }

  if (!skipCache && optimistic) {
    let key = collection.getKey(item)
    if (!isKeyDefined(key)) {
      key = crypto.randomUUID()
    }
    layer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: {
        [key]: {
          ...originalItem,
          ...typeof optimistic === 'object' ? optimistic : {},
          $overrideKey: key,
        },
      },
      deletedItems: new Set(),
      optimistic: true,
      prevent: {
        // @TODO queue mutations and reconcile the optimistic object with the actual result
        update: true,
        delete: true,
      },
    }
    store.$cache.addLayer(layer)
  }

  try {
    // Batching: enqueue into batch scheduler if eligible
    const batchCall = resolveBatchCall(batch)
    if (store.$batch && batchCall.enabled) {
      result = await store.$batch.enqueueCreate(collection, item, meta, batchCall.group) as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
    }
    else {
      const abort = store.$hooks.withAbort()
      await store.$hooks.callHook('createItem', {
        store: store as unknown as GlobalStoreType,
        meta,
        collection,
        item,
        getResult: () => result,
        setResult: (newResult, options) => {
          result = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
          if (result && options?.abort !== false) {
            abort()
          }
        },
        abort,
        formOperations: formOperations as FormOperation[],
      })
    }

    const commitResult = await finalizeMutation(store, {
      meta,
      collection,
      mutation: 'create',
      item,
      result,
      skipCache,
      formOperations: formOperations as FormOperation[],
    }, {
      requireResultError: 'Item creation failed: result is nullish',
      missingCacheKeyError: 'Item creation failed: key is not defined',
      onBeforeApplyCache: removeOptimisticLayer,
    })

    result = commitResult.result as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    removeOptimisticLayer()
    throw error
  }

  return result as NonNullable<typeof result>
}
