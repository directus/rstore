import type { ResolvedCollection } from '@rstore/shared'
import type { Doc as YDoc, Map as YMap } from 'yjs'
import { definePlugin } from '@rstore/core'
import { Map as YMapCtor } from 'yjs'

export interface YjsPluginOptions {
  /**
   * The Yjs document to use for syncing rstore data.
   * You are responsible for connecting this document to a provider
   * (e.g. y-websocket, y-webrtc, y-indexeddb, etc.).
   */
  doc: YDoc

  /**
   * Filter which collections should be synced through Yjs.
   * By default all collections are synced.
   */
  filterCollection?: (collection: ResolvedCollection) => boolean

  /**
   * Prefix for the top-level Y.Map names in the Yjs document.
   * Each collection gets its own Y.Map named `${prefix}${collection.name}`.
   * @default 'rstore:'
   */
  prefix?: string
}

/**
 * Create an rstore plugin that syncs collection data through a Yjs document
 * for realtime collaboration.
 *
 * The plugin maps each collection to a `Y.Map<Y.Map>` inside the provided `Y.Doc`.
 * Each item in a collection is stored as a nested `Y.Map` keyed by the item's primary key.
 * Changes made locally through rstore mutations are pushed to the Yjs document,
 * and remote Yjs changes are applied to the rstore cache automatically.
 *
 * @example
 * ```ts
 * import * as Y from 'yjs'
 * import { WebsocketProvider } from 'y-websocket'
 * import { createYjsPlugin } from '@rstore/yjs'
 *
 * const ydoc = new Y.Doc()
 * const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc)
 *
 * const yjsPlugin = createYjsPlugin({ doc: ydoc })
 * ```
 */
export function createYjsPlugin(options: YjsPluginOptions) {
  const { doc, filterCollection, prefix = 'rstore:' } = options

  /** Maps collection name → Yjs Y.Map for that collection */
  const collectionMaps = new Map<string, YMap<YMap<any>>>()

  /**
   * Tracks whether we're currently applying remote Yjs changes to the rstore cache.
   * Prevents re-entrant loops (Yjs → cache → mutation hook → Yjs).
   */
  let applyingRemote = false

  /**
   * Tracks whether we're currently applying local rstore mutations to Yjs.
   * Prevents re-entrant loops (mutation → Yjs → observer → cache).
   */
  let applyingLocal = false

  function isCollectionIncluded(collection: ResolvedCollection): boolean {
    return filterCollection ? filterCollection(collection) : true
  }

  function getCollectionMap(collection: ResolvedCollection): YMap<YMap<any>> {
    let ymap = collectionMaps.get(collection.name)
    if (!ymap) {
      ymap = doc.getMap(`${prefix}${collection.name}`) as YMap<YMap<any>>
      collectionMaps.set(collection.name, ymap)
    }
    return ymap
  }

  /**
   * Write a plain JS item's fields into a Y.Map.
   * All fields from the item are stored. Nested objects/arrays are
   * JSON-stringified for simplicity; primitives are stored natively
   * for efficient Yjs field-level merging.
   */
  function writeItemToYMap(ymap: YMap<any>, item: Record<string, any>) {
    for (const [field, value] of Object.entries(item)) {
      // Skip internal rstore fields
      if (field.startsWith('$')) {
        continue
      }
      const serialized = serializeValue(value)
      const existing = ymap.get(field)
      if (!valuesEqual(existing, serialized)) {
        ymap.set(field, serialized)
      }
    }
    // Remove fields deleted from the item
    for (const field of ymap.keys()) {
      if (!(field in item)) {
        ymap.delete(field)
      }
    }
  }

  /**
   * Read all fields from a Y.Map into a plain JS object.
   */
  function readYMapToObject(ymap: YMap<any>): Record<string, any> {
    const obj: Record<string, any> = {}
    for (const [key, value] of ymap.entries()) {
      obj[key] = deserializeValue(value)
    }
    return obj
  }

  /**
   * Serialize a value for storage in a Y.Map.
   * Primitives (string, number, boolean) are stored natively.
   * Objects and arrays are JSON-stringified to avoid nested CRDT complexity.
   */
  function serializeValue(value: any): any {
    if (value === null || value === undefined) {
      return value ?? null
    }
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    return value
  }

  /**
   * Deserialize a value read from a Y.Map.
   * Attempts to JSON-parse strings that look like serialized objects/arrays.
   */
  function deserializeValue(value: any): any {
    if (typeof value === 'string' && value.length > 0) {
      const first = value[0]
      if (first === '{' || first === '[') {
        try {
          return JSON.parse(value)
        }
        catch {
          // Not valid JSON, return as-is
        }
      }
    }
    return value
  }

  function valuesEqual(a: any, b: any): boolean {
    if (a === b)
      return true
    if (a == null && b == null)
      return true
    if (a == null || b == null)
      return false
    return false
  }

  return definePlugin({
    name: 'yjs',
    category: 'remote',

    setup({ hook }) {
      hook('init', ({ store }) => {
        for (const collection of store.$collections) {
          if (!isCollectionIncluded(collection)) {
            continue
          }

          const ymap = getCollectionMap(collection)

          // Hydrate rstore cache from existing Yjs state
          for (const [key, value] of ymap.entries()) {
            if (isYMap(value)) {
              const item = readYMapToObject(value)
              store.$cache.writeItem({
                collection,
                key: deserializeKey(key),
                item: item as any,
              })
            }
          }

          // Observe remote changes coming through Yjs
          ymap.observeDeep((events) => {
            if (applyingLocal) {
              return
            }

            applyingRemote = true
            try {
              for (const event of events) {
                if (event.target === ymap) {
                  // Top-level: items added, updated, or deleted
                  for (const [key, change] of event.changes.keys) {
                    if (change.action === 'add' || change.action === 'update') {
                      const itemMap = ymap.get(key)
                      if (isYMap(itemMap)) {
                        const item = readYMapToObject(itemMap)
                        store.$cache.writeItem({
                          collection,
                          key: deserializeKey(key),
                          item: item as any,
                        })
                      }
                    }
                    else if (change.action === 'delete') {
                      store.$cache.deleteItem({
                        collection,
                        key: deserializeKey(key),
                      })
                    }
                  }
                }
                else {
                  // Nested Y.Map: a field inside an item changed
                  const parentKey = findParentKey(ymap, event.target as YMap<any>)
                  if (parentKey != null) {
                    const itemMap = ymap.get(parentKey)
                    if (isYMap(itemMap)) {
                      const item = readYMapToObject(itemMap)
                      store.$cache.writeItem({
                        collection,
                        key: deserializeKey(parentKey),
                        item: item as any,
                      })
                    }
                  }
                }
              }
            }
            finally {
              applyingRemote = false
            }
          })
        }
      })

      // Push local mutations into Yjs

      hook('afterMutation', ({ collection, mutation, getResult, key }) => {
        if (!isCollectionIncluded(collection) || applyingRemote) {
          return
        }

        const ymap = getCollectionMap(collection)

        applyingLocal = true
        try {
          doc.transact(() => {
            if (mutation === 'create' || mutation === 'update') {
              const result = getResult()
              if (result) {
                const itemKey = key ?? collection.getKey(result)
                if (itemKey != null) {
                  const sKey = serializeKey(itemKey)
                  let itemMap = ymap.get(sKey) as YMap<any> | undefined
                  if (!isYMap(itemMap)) {
                    itemMap = new YMapCtor()
                    ymap.set(sKey, itemMap as any)
                  }
                  writeItemToYMap(itemMap, result as Record<string, any>)
                }
              }
            }
            else if (mutation === 'delete') {
              if (key != null) {
                ymap.delete(serializeKey(key))
              }
            }
          })
        }
        finally {
          applyingLocal = false
        }
      })

      hook('afterManyMutation', ({ collection, mutation, getResult, keys }) => {
        if (!isCollectionIncluded(collection) || applyingRemote) {
          return
        }

        const ymap = getCollectionMap(collection)

        applyingLocal = true
        try {
          doc.transact(() => {
            if (mutation === 'create' || mutation === 'update') {
              const results = getResult()
              if (results) {
                for (const result of results) {
                  const itemKey = collection.getKey(result)
                  if (itemKey != null) {
                    const sKey = serializeKey(itemKey)
                    let itemMap = ymap.get(sKey) as YMap<any> | undefined
                    if (!isYMap(itemMap)) {
                      itemMap = new YMapCtor()
                      ymap.set(sKey, itemMap as any)
                    }
                    writeItemToYMap(itemMap, result as Record<string, any>)
                  }
                }
              }
            }
            else if (mutation === 'delete') {
              if (keys) {
                for (const k of keys) {
                  ymap.delete(serializeKey(k))
                }
              }
            }
          })
        }
        finally {
          applyingLocal = false
        }
      })
    },
  })
}

/**
 * Check if a value is a Y.Map instance.
 */
function isYMap(value: any): value is YMap<any> {
  return value != null && typeof value === 'object' && typeof value.entries === 'function' && typeof value.set === 'function' && typeof value.get === 'function'
}

function serializeKey(key: string | number): string {
  return String(key)
}

function deserializeKey(key: string): string | number {
  const num = Number(key)
  return Number.isFinite(num) && String(num) === key ? num : key
}

function findParentKey(parentMap: YMap<any>, childMap: YMap<any>): string | undefined {
  for (const [key, value] of parentMap.entries()) {
    if (value === childMap) {
      return key
    }
  }
  return undefined
}
