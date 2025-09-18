import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StandardSchemaV1, StoreSchema, WrappedItem, WrappedItemBase, WrappedItemUpdateFormOptions, WrappedItemUpdateOptions } from '@rstore/shared'
import type { VueCollectionApi } from './api'
import type { VueStore } from './store'
import { peekFirst, peekMany, type UpdateOptions } from '@rstore/core'
import { markRaw, nextTick, type Ref } from 'vue'

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

  const relationCache = new Map<string, any>()

  const isFrozen = Object.isFrozen(item.value)

  const proxy = new Proxy(item.value, {
    get: (proxyTarget, key) => {
      switch (key) {
        case '$collection':
          return (collection.name) satisfies WrappedItemBase<TCollection, TCollectionDefaults, TSchema>['$collection']

        case '$getKey':
          return () => {
            const key = collection.getKey(item.value)
            if (!key) {
              throw new Error('Key is undefined on item')
            }
            return key
          }

        case '$updateForm':
          return (async (options?: WrappedItemUpdateFormOptions<TCollection, TCollectionDefaults, TSchema>) => {
            const key = collection.getKey(item.value)
            if (!key) {
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
            if (!key) {
              throw new Error('Key is required on item to delete')
            }
            return getApi().delete(key)
          }) satisfies WrappedItemBase<TCollection, TCollectionDefaults, TSchema>['$delete']

        case '$isOptimistic':
          return item.value.$layer?.optimistic

        case '$meta':
          return metadata
      }

      // Resolve computed properties
      if (key in collection.computed) {
        return collection.computed[key as string]!(proxy)
      }

      // Resolve related items in the cache
      if (!isFrozen && key in collection.relations) {
        const cached = relationCache.get(key as string)
        if (cached) {
          return cached
        }

        if (Reflect.has(item.value, key)) {
          // @TODO resolve references
          return Reflect.get(item.value, key)
        }
        else {
          const relation = collection.relations[key as string]!
          const result: Array<any> = []
          for (const targetCollectionName in relation.to) {
            const targetCollectionConfig = relation.to[targetCollectionName]!
            const targetCollection = store.$collections.find(m => m.name === targetCollectionName)
            if (!targetCollection) {
              throw new Error(`Collection "${targetCollectionName}" does not exist in the store`)
            }
            const values: Record<string, any> = {}
            const on = targetCollectionConfig.on as Record<string, string>
            for (const key in on) {
              const foreignKey = key
              const currentKey = on[key]!
              values[foreignKey] = Reflect.get(proxy, currentKey)
            }
            const cacheResultForTarget = (relation.many ? peekMany : peekFirst)({
              store,
              collection: targetCollection,
              findOptions: {
                filter: (foreignItem) => {
                  for (const key in values) {
                    if (foreignItem[key] !== values[key]) {
                      return false
                    }
                  }
                  return true
                },
              },
              force: true,
            }).result
            if (Array.isArray(cacheResultForTarget)) {
              result.push(...cacheResultForTarget)
            }
            else if (cacheResultForTarget) {
              result.push(cacheResultForTarget)
              break
            }
          }

          let finalResult
          if (relation.many) {
            finalResult = result
          }
          else {
            finalResult = result[0]
          }

          relationCache.set(key as string, finalResult)
          nextTick(() => {
            relationCache.delete(key as string)
          })

          return finalResult
        }
      }

      return Reflect.get(isFrozen ? proxyTarget : item.value, key)
    },

    set: () => {
      throw new Error('Items are read-only. Use `item.$updateForm()` to update the item.')
    },

    ownKeys: () => Reflect.ownKeys(item.value),

    has: (_target, key) => Reflect.has(item.value, key),

    getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(item.value, key),

    defineProperty: (_target, property, attributes) => Reflect.defineProperty(item.value, property, attributes),

    deleteProperty: () => {
      throw new Error('Items are read-only. Use `item.$delete()` to delete the item.')
    },
  })

  return proxy as WrappedItem<TCollection, TCollectionDefaults, TSchema>
}

declare module '@rstore/shared' {
  export interface WrappedItemUpdateFormOptions<
    TCollection extends Collection = Collection,
    TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
    TSchema extends StoreSchema = StoreSchema,
  > extends Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'> {
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
  }

  export interface WrappedItemUpdateOptions<
    TCollection extends Collection = Collection,
    TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
    TSchema extends StoreSchema = StoreSchema,
  > extends Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'> {
  }

  export interface WrappedItemBase<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    $meta: WrappedItemMetadata<TCollection, TCollectionDefaults, TSchema>
  }
}

export interface WrappedItemMetadata<
  _TCollection extends Collection,
  _TCollectionDefaults extends CollectionDefaults,
  _TSchema extends StoreSchema,
> {
  queries: Set<any>
  dirtyQueries: Set<any>
}
