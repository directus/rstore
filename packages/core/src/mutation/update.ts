import type { BatchCallConfig, CacheLayer, Collection, CollectionDefaults, CustomHookMeta, FormOperation, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps, set } from '@rstore/shared'
import { resolveBatchCall } from '../batch'
import { isKeyDefined } from '../key'
import { peekFirst } from '../query'
import { finalizeMutation } from './finalizeMutation'

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
  item,
  key,
  skipCache,
  optimistic = true,
  formOperations,
  batch,
}: UpdateOptions<TCollection, TCollectionDefaults, TSchema>): Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> {
  const meta: CustomHookMeta = {}

  const originalItem = item

  item = pickNonSpecialProps(item, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

  key ??= collection.getKey(item)

  if (!isKeyDefined(key)) {
    throw new Error('Item update failed: key is not defined')
  }

  // Check if existing item has a layer that prevents update
  const existingItem = store.$cache.readItem({ collection, key })
  if (existingItem?.$layer) {
    const layer = existingItem.$layer as CacheLayer
    if (layer.prevent?.update) {
      console.error(layer)
      throw new Error(`Item update prevented by the layer: ${layer.id}`)
    }
  }

  store.$processItemSerialization(collection, item)

  await store.$hooks.callHook('beforeMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'update',
    key,
    item,
    modifyItem: (path: any, value: any) => {
      set(item, path, value)
    },
    setItem: (newItem) => {
      item = newItem as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
    },
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

  let layer: CacheLayer | undefined
  const removeOptimisticLayer = () => {
    if (layer) {
      store.$cache.removeLayer(layer.id)
      layer = undefined
    }
  }

  if (!skipCache && optimistic) {
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
    }

    store.$cache.addLayer(layer)
  }

  try {
    // Batching: enqueue into batch scheduler if eligible
    const batchCall = resolveBatchCall(batch)
    if (store.$batch && batchCall.enabled) {
      result = await store.$batch.enqueueUpdate(collection, key, item, meta, batchCall.group) as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
    }
    else {
      const abort = store.$hooks.withAbort()
      await store.$hooks.callHook('updateItem', {
        store: store as unknown as GlobalStoreType,
        meta,
        collection,
        key,
        item,
        getResult: () => result ?? undefined,
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
      mutation: 'update',
      key,
      item,
      result: result ?? undefined,
      skipCache,
      formOperations: formOperations as FormOperation[],
    }, {
      requireResultError: 'Item update failed: result is nullish',
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
