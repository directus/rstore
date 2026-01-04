import type { Cache, Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem, WrappedItemBase, WrappedItemUpdateFormOptions, WrappedItemUpdateOptions } from '@rstore/shared'
import type { Ref } from 'vue'
import type { VueCollectionApi } from './api'
import type { VueCachePrivate } from './cache'
import type { VueStore } from './store'
import { isKeyDefined } from '@rstore/core'
import { cloneInfo } from '@rstore/shared'
import { markRaw, toRaw } from 'vue'

export interface WrapItemOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: VueStore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  item: Ref<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  metadata: WrappedItemMetadata<TCollection, TCollectionDefaults, TSchema>
}

export function wrapItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  item,
  metadata,
}: WrapItemOptions<TCollection, TCollectionDefaults, TSchema>): WrappedItem<TCollection, TCollectionDefaults, TSchema> {
  function getApi(): VueCollectionApi<TCollection, TCollectionDefaults, TSchema, WrappedItem<TCollection, TCollectionDefaults, TSchema>> {
    return store[collection.name as keyof typeof store] as any
  }

  const cache = store.$cache as unknown as Cache & VueCachePrivate

  const isFrozen = Object.isFrozen(item.value)

  const proxy = new Proxy(item.value, {
    get: (proxyTarget, key) => {
      switch (key) {
        case '$collection':
          return (collection.name) satisfies WrappedItemBase<TCollection, TCollectionDefaults, TSchema>['$collection']

        case '$getKey':
          return () => {
            const key = collection.getKey(item.value)
            if (!isKeyDefined(key)) {
              throw new Error('Key is undefined on item')
            }
            return key
          }

        case '$updateForm':
          return (async (options?: WrappedItemUpdateFormOptions<TCollection, TCollectionDefaults, TSchema>) => {
            const key = collection.getKey(item.value)
            if (!isKeyDefined(key)) {
              throw new Error('Key is required on item to update')
            }
            const form = await getApi().updateForm({
              key,
            }, {
              defaultValues: options?.defaultValues,
            })
            if (options?.schema) {
              form.$schema = markRaw(options.schema)
            }
            return form
          }) satisfies WrappedItemBase<TCollection, TCollectionDefaults, TSchema>['$updateForm']

        case '$update':
          return ((data: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>, options?: WrappedItemUpdateOptions<TCollection, TCollectionDefaults, TSchema>) => {
            const key = collection.getKey(item.value)
            return getApi().update(data, {
              ...options,
              key,
            })
          }) satisfies WrappedItemBase<TCollection, TCollectionDefaults, TSchema>['$update']

        case '$delete':
          return (() => {
            const key = collection.getKey(item.value)
            if (!isKeyDefined(key)) {
              throw new Error('Key is required on item to delete')
            }
            return getApi().delete(key)
          }) satisfies WrappedItemBase<TCollection, TCollectionDefaults, TSchema>['$delete']

        case '$isOptimistic':
          return item.value.$layer?.optimistic

        case '$meta':
          return metadata

        case '$raw':
          return () => toRaw(item.value)

        case 'toJSON':
          return () => item.value
      }

      // Resolve computed properties
      if (key in collection.computed) {
        return collection.computed[key as string]!(proxy)
      }

      // Resolve related items in the cache
      if (!isFrozen && key in collection.normalizedRelations) {
        if (Reflect.has(item.value, key)) {
          // @TODO resolve references
          return Reflect.get(item.value, key)
        }
        else {
          const relation = collection.normalizedRelations[key as string]!
          const result: Array<any> = []
          for (const target of relation.to) {
            const targetCollection = store.$collections.find(m => m.name === target.collection)
            if (!targetCollection) {
              throw new Error(`Collection "${target.collection}" does not exist in the store`)
            }
            const indexKeys = Object.keys(target.on).sort()
            const indexKey = indexKeys.join(':')
            const indexValues = indexKeys.map((k) => {
              const currentKey = target.on[k]!
              return Reflect.get(proxy, currentKey)
            })
            if (indexValues.every(v => v != null)) {
              const indexValue = indexValues.join(':')
              const cacheResultForTarget = cache.readItems({
                collection: targetCollection,
                indexKey,
                indexValue,
                limit: relation.many ? undefined : 1,
                filter: target.filter
                  ? (item) => {
                      return target.filter!(proxy, item)
                    }
                  : undefined,
              })
              result.push(...cacheResultForTarget)
            }
          }

          let finalResult
          if (relation.many) {
            finalResult = result
          }
          else {
            finalResult = result[0]
          }

          return finalResult
        }
      }

      return Reflect.get(isFrozen ? proxyTarget : item.value, key)
    },

    set: () => {
      throw new Error('Items are read-only. Use `item.$updateForm()` to update the item.')
    },

    ownKeys: () => cloneInfo.cloning
      ? Reflect.ownKeys(item.value)
      : Array.from(new Set([
          ...Reflect.ownKeys(item.value),
          ...Object.keys(collection.computed),
          ...Object.keys(collection.relations),
        ])),

    has: (_target, key) => Reflect.has(item.value, key) || (
      !cloneInfo.cloning && (
        key in collection.computed
        || key in collection.relations
      )
    ),

    getOwnPropertyDescriptor: (_target, key) => {
      if (!cloneInfo.cloning && (key in collection.computed || key in collection.relations)) {
        return {
          enumerable: true,
          configurable: true,
        }
      }
      return Reflect.getOwnPropertyDescriptor(item.value, key)
    },

    defineProperty: (_target, property, attributes) => {
      if (property in collection.computed || property in collection.relations) {
        throw new Error(`Cannot define property ${String(property)} because it is a computed property or a relation`)
      }
      return Reflect.defineProperty(item.value, property, attributes)
    },

    deleteProperty: () => {
      throw new Error('Items are read-only. Use `item.$delete()` to delete the item.')
    },
  })

  return proxy as WrappedItem<TCollection, TCollectionDefaults, TSchema>
}

export interface WrappedItemMetadata<
  _TCollection extends Collection,
  _TCollectionDefaults extends CollectionDefaults,
  _TSchema extends StoreSchema,
> {
  queries: Set<any>
  dirtyQueries: Set<any>
}
