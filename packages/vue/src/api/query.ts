import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { MaybeRefOrGetter } from 'vue'
import type { QueryManyOptions, QueryType } from './types'
import { findFirst, findMany, peekFirst, peekMany, subscribe, unsubscribe } from '@rstore/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'
import { realtimeReconnectEventHook } from '../events'
import { createQuery } from '../query'

export interface CollectionApiRuntime {
  store: any
  getCollection: () => any
  onInvalidate?: (cb: () => unknown) => { off: () => void }
}

/**
 * Create and run a collection query or live query.
 */
export function runApiQuery(
  runtime: CollectionApiRuntime,
  optionsGetter: (queryBuilder: any) => any,
  isLive: boolean,
) {
  const { boundOptionsGetter, type } = bindQueryOptionsGetter(optionsGetter)
  let meta: CustomHookMeta | undefined
  if (isLive) {
    const subResult = subscribeToApiQuery(runtime, boundOptionsGetter())
    meta = subResult.meta.value
  }

  const query = createApiQuery(runtime, boundOptionsGetter, type)
  if (meta) {
    Object.assign(query.meta.value, meta)
  }
  if (isLive) {
    realtimeReconnectEventHook.on(() => query.refresh())
  }
  if (runtime.onInvalidate) {
    const { off } = runtime.onInvalidate(() => query.refresh())
    tryOnScopeDispose(() => off())
  }
  return query
}

/**
 * Subscribe and keep subscription options in sync with reactive input.
 */
export function subscribeToApiQuery(
  runtime: CollectionApiRuntime,
  keyOrFindOptions?: MaybeRefOrGetter<string | number | FindOptions<any, any, any> | undefined>,
) {
  if (runtime.store.$isServer) {
    return {
      unsubscribe: () => Promise.resolve(),
      meta: ref<CustomHookMeta>({}),
    }
  }

  const meta = ref<CustomHookMeta>({})
  let subscriptionId: string | undefined
  let previousKey: string | number | undefined
  let previousFindOptions: FindOptions<any, any, any> | undefined

  async function unsub() {
    if (!subscriptionId)
      return
    unsubscribe({
      store: runtime.store,
      meta: meta.value,
      collection: runtime.getCollection(),
      subscriptionId,
      key: previousKey,
      findOptions: previousFindOptions,
    })
    subscriptionId = undefined
    previousKey = undefined
    previousFindOptions = undefined
  }

  async function sub(optionsValue: string | number | FindOptions<any, any, any> | undefined) {
    await unsub()
    subscriptionId = crypto.randomUUID()
    previousKey = typeof optionsValue === 'string' || typeof optionsValue === 'number' ? optionsValue : undefined
    previousFindOptions = typeof optionsValue === 'object' ? optionsValue : undefined
    await subscribe({
      store: runtime.store,
      meta: meta.value,
      collection: runtime.getCollection(),
      subscriptionId,
      key: previousKey,
      findOptions: previousFindOptions,
    })
  }

  watch(() => toValue(keyOrFindOptions), value => sub(value), { immediate: true })
  tryOnScopeDispose(unsub)
  if (runtime.onInvalidate) {
    const { off } = runtime.onInvalidate(() => sub(toValue(keyOrFindOptions)))
    tryOnScopeDispose(() => off())
  }
  return { unsubscribe: unsub, meta }
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
            }).then(r => r.result)
          : Promise.resolve(null))
      : findMany({
          store: runtime.store,
          collection: runtime.getCollection(),
          findOptions: options,
          meta,
        }).then(r => r.result),
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
