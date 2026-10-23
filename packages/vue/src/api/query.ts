import type { FindOptions } from '@rstore/shared'
import type { MaybeRefOrGetter } from 'vue'
import type { LiveQueryOptions, QueryManyOptions, QueryType } from './types'
import { findFirst, findMany, peekFirst, peekMany } from '@rstore/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { ref, toValue } from 'vue'
import { realtimeReconnectEventHook } from '../events'
import { createQuery } from '../query'
import { markFetchConfirmation } from '../query/confirmation'
import { subscribeToLivePages } from './livePages'

export { subscribeToApiQuery } from './subscription'

/** Collection services shared by query and subscription adapters. */
export interface CollectionApiRuntime {
  /** Owning store. */
  store: any
  /** Resolve the current collection. */
  getCollection: () => any
  /** Follow collection replacement. */
  onInvalidate?: (cb: () => unknown) => { off: () => void }
}

/**
 * Create and run a collection query or live query.
 */
export function runApiQuery(
  runtime: CollectionApiRuntime,
  optionsGetter: (queryBuilder: any) => any,
  isLive: boolean,
  liveOptions?: LiveQueryOptions,
) {
  const { boundOptionsGetter, type } = bindQueryOptionsGetter(optionsGetter)
  const query = createApiQuery(runtime, boundOptionsGetter, type)
  if (isLive) {
    subscribeToLivePages(runtime, query, boundOptionsGetter, toValue(type) === 'many', liveOptions)
  }
  if (isLive && !runtime.store.$isServer) {
    // `realtimeReconnectEventHook` is module-level: skip registration on the
    // server (server scopes are never disposed, so every SSR request would
    // leak the query graph) and detach the listener on scope dispose.
    const { off } = realtimeReconnectEventHook.on(() => query.refresh())
    tryOnScopeDispose(off)
  }
  if (runtime.onInvalidate) {
    const { off } = runtime.onInvalidate(() => query.refresh())
    tryOnScopeDispose(() => off())
  }
  return query
}

/**
 * Bind query builder calls and strip the private query type marker.
 */
function bindQueryOptionsGetter(optionsGetter: (queryBuilder: any) => any) {
  const queryBuilder = {
    first: (options: any) => ({
      ...typeof options === 'object' ? options : { key: options },
      '~type': 'first' satisfies QueryType,
    }),
    many: (options: QueryManyOptions<any, any, any> | undefined) => ({
      ...options,
      '~type': 'many' satisfies QueryType,
    }),
  }
  const type = ref<QueryType>('first')
  const boundOptionsGetter = () => {
    const result = optionsGetter(queryBuilder)
    type.value = result['~type']
    const value = { ...result }
    delete value['~type']
    return value
  }
  boundOptionsGetter()
  return { boundOptionsGetter, type }
}

/**
 * Create the underlying reactive query object.
 */
function createApiQuery(
  runtime: CollectionApiRuntime,
  boundOptionsGetter: () => FindOptions<any, any, any>,
  type: MaybeRefOrGetter<QueryType>,
) {
  return createQuery({
    store: runtime.store,
    fetchMethod: (options, meta) => toValue(type) === 'first'
      ? (options
          ? findFirst({
              store: runtime.store,
              collection: runtime.getCollection(),
              findOptions: options,
              meta,
            }).then((r) => {
              // Core returns a fetch promise only when the fetch path ran.
              markFetchConfirmation(meta, r.fetchPromise != null)
              return r.result
            })
          : Promise.resolve(null))
      : findMany({
          store: runtime.store,
          collection: runtime.getCollection(),
          findOptions: options,
          meta,
        }).then((r) => {
          markFetchConfirmation(meta, r.fetchPromise != null)
          return r.result
        }),
    cacheMethod: (options, meta) => toValue(type) === 'first'
      ? (options
          ? peekFirst({
            store: runtime.store,
            collection: runtime.getCollection(),
            findOptions: options,
            meta,
            force: true,
          }).result
          : null)
      : peekMany({
        store: runtime.store,
        collection: runtime.getCollection(),
        findOptions: options,
        meta,
        force: true,
      }).result,
    defaultValue: toValue(type) === 'first' ? () => null : () => [],
    id: () => `${toValue(runtime.getCollection().name)}-${toValue(type)}`,
    getCollection: runtime.getCollection,
    options: boundOptionsGetter,
    many: toValue(type) === 'many',
  })
}
