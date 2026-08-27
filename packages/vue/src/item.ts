import type { Cache, Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem, WrappedItemBase, WrappedItemUpdateFormOptions, WrappedItemUpdateOptions } from '@rstore/shared'
import type { Ref } from 'vue'
import type { VueCollectionApi } from './api'
import type { VueCachePrivate } from './cache'
import type { VueStore } from './store'
import { isKeyDefined } from '@rstore/core'
import { cloneInfo } from '@rstore/shared'
import { markRaw, toRaw } from 'vue'
import { createItemRelationReader } from './itemRelations'

/** Dependencies used to create one read-only live item proxy. */
export interface WrapItemOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /** Owning Vue store. */
  store: VueStore<TSchema, TCollectionDefaults>
  /** Resolved item collection. */
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  /** Live raw item source. */
  item: Ref<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  /** Query ownership metadata shared with cache GC. */
  metadata: WrappedItemMetadata<TCollection, TCollectionDefaults, TSchema>
  /**
   * Non-reactive snapshot used to seed the proxy facade. When omitted,
   * `item.value` is read once at construction.
   *
   * For engine-backed items, `item` is a tracking `computed` that registers a
   * fine-grained signal on read. Reading it during construction would leak that
   * dependency into whatever effect first wraps the item (e.g. a list query),
   * defeating the per-item granularity. Passing the raw item here keeps the
   * computed lazy: it is only evaluated when an actual field is accessed.
   */
  seed?: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
}

/** Create a read-only proxy that resolves fields and relations from live state. */
export function wrapItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  item,
  metadata,
  seed,
}: WrapItemOptions<TCollection, TCollectionDefaults, TSchema>): WrappedItem<TCollection, TCollectionDefaults, TSchema> {
  function getApi(): VueCollectionApi<TCollection, TCollectionDefaults, TSchema, WrappedItem<TCollection, TCollectionDefaults, TSchema>> {
    return store[collection.name as keyof typeof store] as any
  }

  const relatedCollections = new Map<string, ResolvedCollection<any, any, any>>()
  const relationReaders = new Map<PropertyKey, (current: any) => any>()

  /** Resolve and cache one relation target collection for this wrapper. */
  function getRelatedCollection(name: string): ResolvedCollection<any, any, any> {
    let targetCollection = relatedCollections.get(name)
    if (!targetCollection) {
      targetCollection = store.$collections.find(candidate => candidate.name === name)
      if (!targetCollection)
        throw new Error(`Collection "${name}" does not exist in the store`)
      relatedCollections.set(name, targetCollection)
    }
    return targetCollection
  }

  const cache = store.$cache as unknown as Cache & VueCachePrivate

  // Proxying a frozen item directly prevents `get` from returning later field
  // values. Use an extensible facade with the same prototype so every wrapper
  // can keep reading its live engine source without violating Proxy invariants.
  const source = seed ?? item.value
  const target = Object.create(Object.getPrototypeOf(source)) as typeof source

  const proxy = new Proxy(target, {
    get: (_target, key) => {
      const current = item.value
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
          return current.$layer?.optimistic ?? false

        case '$meta':
          return metadata

        case '$raw':
          return () => toRaw(current)

        case 'toJSON':
          return () => current
      }

      // Resolve computed properties
      if (key in collection.computed) {
        return collection.computed[key as string]!(proxy)
      }

      // Resolve related items in the cache
      if (!Object.isFrozen(current) && key in collection.normalizedRelations) {
        if (Reflect.has(current, key)) {
          // @TODO resolve references
          return Reflect.get(current, key)
        }
        else {
          const relation = collection.normalizedRelations[key as string]!
          let reader = relationReaders.get(key)
          if (!reader) {
            reader = createItemRelationReader({ cache, collection, proxy, relation, getCollection: getRelatedCollection })
            relationReaders.set(key, reader)
          }
          return reader(current)
        }
      }

      return Reflect.get(current, key)
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
      const descriptor = Reflect.getOwnPropertyDescriptor(item.value, key)
      return descriptor ? { ...descriptor, configurable: true } : undefined
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

/** Query references retaining one wrapped item in cache. */
export interface WrappedItemMetadata<
  _TCollection extends Collection,
  _TCollectionDefaults extends CollectionDefaults,
  _TSchema extends StoreSchema,
> {
  /** Queries currently owning the item. */
  queries: Set<any>
  /** Owning queries that need reconciliation. */
  dirtyQueries: Set<any>
}
