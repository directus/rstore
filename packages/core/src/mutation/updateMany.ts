import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, GlobalStoreType, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'
import { isKeyDefined } from '../key'
import { peekMany } from '../query'
import { finalizeMutation } from './finalizeMutation'
import { assertMutationAllowed, createOptimisticLayerLifecycle, prepareMutationItems } from './optimistic'

export interface UpdateManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
  skipCache?: boolean
  optimistic?: boolean | Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>
}

export async function updateMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  items,
  skipCache,
  optimistic = true,
}: UpdateManyOptions<TCollection, TCollectionDefaults, TSchema>): Promise<Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>> {
  const meta: CustomHookMeta = {}

  let preparedItems: ReturnType<typeof prepareMutationItems<TCollection, TCollectionDefaults, TSchema>> = []

  /** Rebuild aligned wire entries, optimistic values, and validated keys after a hook replacement. */
  function getItemsWithKey(items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>) {
    const keys = new Set<string | number>()
    const layerItems: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>> = []
    preparedItems = prepareMutationItems(store, collection, items, preparedItems)
    const entries = preparedItems.map((prepared) => {
      const key = collection.getKey(prepared.optimisticItem)
      if (!isKeyDefined(key)) {
        throw new Error('Item update failed: key is not defined')
      }
      keys.add(key)

      assertMutationAllowed(store, collection, key, 'update')

      layerItems.push(prepared.optimisticItem)
      return {
        key,
        item: prepared.transportItem,
      }
    })
    return { entries, keys, layerItems }
  }

  let { entries: itemsWithKey, keys: allKeys, layerItems } = getItemsWithKey(items)
  const transportItems = itemsWithKey.map(entry => entry.item)
  await store.$hooks.callHook('beforeManyMutation', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    mutation: 'update',
    items: transportItems,
    setItems: (newItems) => {
      const prepared = getItemsWithKey(newItems as Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>)
      itemsWithKey = prepared.entries
      allKeys = prepared.keys
      layerItems = prepared.layerItems
      transportItems.splice(0, transportItems.length, ...itemsWithKey.map(entry => entry.item))
    },
  })

  let result: Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> = skipCache
    ? []
    : peekMany({
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions: {
        filter: (item) => {
          const key = collection.getKey(item)
          return isKeyDefined(key) && allKeys.has(key)
        },
      },
    }).result

  if (result.length) {
    result = result.map(item => pickNonSpecialProps(item) as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>)
  }

  const optimisticLayer = createOptimisticLayerLifecycle(store)

  if (!skipCache && optimistic) {
    const optimisticState: Record<string, any> = {}
    for (const [i, { key }] of itemsWithKey.entries()) {
      const originalItem = layerItems[i]!
      const optimisticOverride = Array.isArray(optimistic) ? optimistic[i] : {}
      optimisticState[key] = {
        ...originalItem,
        ...optimisticOverride,
        $overrideKey: key,
      }
    }
    const layer: CacheLayer = {
      id: crypto.randomUUID(),
      collectionName: collection.name,
      state: optimisticState,
      deletedItems: new Set(),
      optimistic: true,
    }

    optimisticLayer.add(layer)
  }

  try {
    const _abort = store.$hooks.withAbort({ explicit: true })
    let aborted = false
    const abort = () => {
      _abort()
      aborted = true
    }
    await store.$hooks.callHook('updateMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      items: itemsWithKey,
      getResult: () => result,
      setResult: (newResult, options) => {
        result = newResult as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
        if (result.length && options?.abort !== false) {
          abort()
        }
      },
      abort,
    }, _abort)

    // If the operation wasn't aborted (= wasn't handled), we perform updateItem for each item
    if (!aborted) {
      await Promise.all(itemsWithKey.map(async ({ key, item }) => {
        let singleResult: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | undefined

        const abort = store.$hooks.withAbort({ explicit: true })
        await store.$hooks.callHook('updateItem', {
          store: store as unknown as GlobalStoreType,
          meta,
          collection,
          key,
          item,
          getResult: () => singleResult ?? undefined,
          setResult: (newResult, options) => {
            singleResult = newResult as ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
            if (singleResult && options?.abort !== false) {
              abort()
            }
          },
          abort,
        }, abort)

        if (singleResult) {
          const index = result.findIndex(r => collection.getKey(r) === key)
          if (index > -1) {
            result[index] = {
              ...result[index]!,
              ...singleResult,
            }
          }
          else {
            result.push(singleResult)
          }
        }
      }))
    }

    const commitResult = await finalizeMutation(store, {
      meta,
      collection,
      mutation: 'update',
      items: itemsWithKey,
      results: result,
      skipCache,
    }, {
      emitItemHooks: !aborted,
      onBeforeApplyCache: optimisticLayer.remove,
    })

    result = commitResult.results as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> ?? []

    if (result.length) {
      // Sort result to match the order of input items
      const resultByKey: Record<string | number, ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>> = {}
      for (const item of result) {
        const key = collection.getKey(item)
        if (isKeyDefined(key)) {
          resultByKey[key] = item
        }
      }
      result = itemsWithKey.map(({ key }) => resultByKey[key]).filter(Boolean) as Array<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
    }
  }
  catch (error) {
    // Rollback optimistic layer in case of error
    optimisticLayer.remove()
    throw error
  }

  return result
}
