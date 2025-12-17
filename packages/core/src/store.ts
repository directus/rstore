import type { Cache, CollectionDefaults, CustomHookMeta, FindOptions, GlobalStoreType, Hooks, MutationSpecialProps, Plugin, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { get, set } from '@rstore/shared'
import { builtinCollectionHooksPlugin } from './builtin/collectionHooks'
import { addCollectionRelations, isCollectionRelations, normalizeCollectionRelations, resolveCollectionOppositeRelations, resolveCollections } from './collection'
import { defaultFetchPolicy } from './fetchPolicy'
import { setupPlugin, sortPlugins } from './plugin'

export interface CreateStoreCoreOptions<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  cache: Cache
  schema: TSchema
  collectionDefaults?: TCollectionDefaults
  plugins?: Array<Plugin>
  hooks: Hooks<TSchema, TCollectionDefaults>
  findDefaults?: Partial<FindOptions<any, any, any>>
  isServer?: boolean
  transformStore?: (store: StoreCore<TSchema, TCollectionDefaults>) => StoreCore<TSchema, TCollectionDefaults>
  syncImmediately?: boolean
}

const resolvedFindOptionsMarker = Symbol('resolvedFindOptions')

export async function createStoreCore<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
>(options: CreateStoreCoreOptions<TSchema, TCollectionDefaults>): Promise<StoreCore<TSchema, TCollectionDefaults>> {
  // Create store

  const collections = resolveCollections(options.schema, options.collectionDefaults)

  const optionPlugins = options.plugins ?? []
  optionPlugins.unshift(builtinCollectionHooksPlugin)

  let store: StoreCore<TSchema, TCollectionDefaults> = {
    $cache: options.cache,
    $collections: collections,
    $collectionDefaults: options.collectionDefaults ?? {} as TCollectionDefaults,
    $plugins: sortPlugins(optionPlugins.map(p => ({ ...p, hooks: {} }))),
    $hooks: options.hooks,
    $findDefaults: options.findDefaults ?? {},
    $resolveFindOptions(collection, options, many, meta) {
      if ((options as any)[resolvedFindOptionsMarker]) {
        return options as any
      }
      const resolvedOptions: FindOptions<any, any, any> = {
        ...store.$findDefaults,
        ...options,
        fetchPolicy: options.fetchPolicy ?? store.$findDefaults.fetchPolicy ?? defaultFetchPolicy,
      }
      store.$hooks.callHookSync('resolveFindOptions', {
        store: store as unknown as GlobalStoreType,
        collection,
        many,
        meta,
        findOptions: resolvedOptions,
        updateFindOptions: (newFindOptions: any) => {
          Object.assign(resolvedOptions, newFindOptions)
        },
      })
      if (resolvedOptions.meta) {
        Object.assign(meta, resolvedOptions.meta)
      }
      Object.defineProperty(resolvedOptions, resolvedFindOptionsMarker, {
        value: true,
        enumerable: false,
      })
      return resolvedOptions
    },
    $processItemParsing(collection, item) {
      store.$hooks.callHookSync('parseItem', {
        store: store as unknown as GlobalStoreType,
        meta: {},
        collection,
        item,
        modifyItem: (path, value) => {
          set(item, path, value as any)
        },
      })
    },
    $processItemSerialization(collection, item) {
      store.$hooks.callHookSync('serializeItem', {
        store: store as unknown as GlobalStoreType,
        meta: {},
        collection,
        item,
        modifyItem: (path, value) => {
          set(item, path, value as any)
        },
      })
    },
    $getCollection(item, collectionNames?) {
      if (collectionNames?.length === 1) {
        return store.$collections.find(m => m.name === collectionNames[0]) ?? null
      }
      if (typeof item?.$collection === 'string') {
        const result = store.$collections.find(m => m.name === item.$collection)
        if (result) {
          return result
        }
      }
      const collections = collectionNames ? store.$collections.filter(m => collectionNames?.includes(m.name)) : store.$collections
      for (const collection of collections) {
        if (collection.isInstanceOf(item)) {
          return collection
        }
      }
      return null
    },
    $mutationHistory: [],
    $isServer: options.isServer ?? false,
    $dedupePromises: new Map(),
    $registeredModules: new Map(),
    $wrapMutation: mutation => mutation as typeof mutation & MutationSpecialProps,
    async $sync() {
      store.$syncState.isSyncing = true
      store.$syncState.error = undefined
      store.$syncState.loadedCollections.clear()
      store.$syncState.syncedCollections.clear()
      try {
        const meta: CustomHookMeta = {}

        await store.$hooks.callHookWith('sync', async (callbacks) => {
          let globalProgress = 0
          for (const { callback } of callbacks) {
            let callbackProgress = 0
            await callback({
              store: store as any,
              meta,
              setProgress: ({ percent, message }) => {
                callbackProgress = percent
                store.$syncState.progress = globalProgress + (callbackProgress / callbacks.length)
                store.$syncState.progressMessage = message
              },
              setCollectionLoaded: (collectionName) => {
                store.$syncState.loadedCollections.add(collectionName)
              },
              setCollectionSynced: (collectionName) => {
                store.$syncState.syncedCollections.add(collectionName)
              },
            })
            globalProgress += 1 / callbacks.length
            store.$syncState.progress = globalProgress
          }
        })

        store.$syncState.lastSyncAt = new Date()
        window.localStorage.setItem('rstore-last-sync-at', store.$syncState.lastSyncAt.toISOString())
      }
      catch (error) {
        store.$syncState.error = error as Error
      }
      finally {
        store.$syncState.isSyncing = false
      }
    },
    $syncState: {
      isSyncing: false,
      lastSyncAt: getLastSyncedAt(),
      loadedCollections: new Set(),
      syncedCollections: new Set(),
    },
  }

  function getLastSyncedAt(): Date | undefined {
    if (typeof window != 'undefined') {
      const timestamp = window.localStorage.getItem('rstore-last-sync-at')
      if (timestamp) {
        return new Date(Number(timestamp))
      }
    }
  }

  for (const item of options.schema) {
    if (isCollectionRelations(item)) {
      addCollectionRelations(store, item)
    }
  }

  normalizeCollectionRelations(store.$collections)
  resolveCollectionOppositeRelations(store.$collections)

  if (options.transformStore) {
    store = options.transformStore(store)
  }

  // Setup plugins

  store.$plugins.forEach(plugin => setupPlugin(store, plugin))

  // Init store hook

  const meta: CustomHookMeta = {}

  await store.$hooks.callHook('init', {
    store: store as unknown as GlobalStoreType,
    meta,
  })

  // Collection hooks

  store.$hooks.hook('parseItem', (payload) => {
    if (payload.collection.fields) {
      for (const path in payload.collection.fields) {
        const fieldConfig = payload.collection.fields[path]!
        if (fieldConfig.parse) {
          const value = get(payload.item, path as any)
          if (value != null) {
            payload.modifyItem(path as any, fieldConfig.parse(value))
          }
        }
      }
    }

    for (const key in payload.item) {
      if (key in payload.collection.relations) {
        const value = payload.item[key]
        if (value) {
          if (Array.isArray(value)) {
            for (const child of value as any[]) {
              parseNestedItem(payload.collection, key, child)
            }
          }
          else {
            parseNestedItem(payload.collection, key, value)
          }
        }
      }
    }
  })

  function parseNestedItem(parentCollection: ResolvedCollection, key: string, child: any) {
    const relation = parentCollection.relations![key]!
    const possibleCollections = Object.keys(relation.to)
    const childCollection = store.$getCollection(child, possibleCollections)
    if (!childCollection) {
      throw new Error(`Could not determine for relation ${parentCollection.name}.${String(key)}`)
    }
    store.$processItemParsing(childCollection, child)
  }

  store.$hooks.hook('serializeItem', (payload) => {
    if (payload.collection.fields) {
      for (const path in payload.collection.fields) {
        const fieldConfig = payload.collection.fields[path]!
        if (fieldConfig.serialize) {
          const value = get(payload.item, path as any)
          if (value != null) {
            payload.modifyItem(path as any, fieldConfig.serialize(value))
          }
        }
      }
    }
  })

  if (!store.$isServer && (options.syncImmediately ?? true)) {
    store.$sync()
  }

  return store
}
