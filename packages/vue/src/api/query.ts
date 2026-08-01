import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { MaybeRefOrGetter } from 'vue'
import type { QueryManyOptions, QueryType } from './types'
import { findFirst, findMany, peekFirst, peekMany, subscribe, unsubscribe } from '@rstore/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { deepEqual } from 'fast-equals'
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
  // Pass the getter itself (not a snapshot) so the realtime subscription
  // follows reactive option changes along with the query.
  const subResult = isLive ? subscribeToApiQuery(runtime, boundOptionsGetter) : undefined

  const query = createApiQuery(runtime, boundOptionsGetter, type)
  if (subResult) {
    // Share a single meta object between the subscription and the query so
    // meta written by (async) subscribe hooks is visible to query fetches.
    // Copying synchronously here would only see an empty object because the
    // subscribe hooks have not resolved yet.
    Object.assign(subResult.meta.value, query.meta.value)
    query.meta.value = subResult.meta.value
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
  let previousCollection: any

  // All subscribe/unsubscribe work is chained on this promise so rapid
  // option changes cannot interleave their async steps and orphan a
  // server-side subscription.
  let queue: Promise<void> = Promise.resolve()

  /** Chain a task after all pending subscription work, errors included. */
  function enqueue(task: () => Promise<void>): Promise<void> {
    queue = queue.then(task, task)
    return queue
  }

  /** Unsubscribe the current subscription (must run inside the queue). */
  async function unsubNow() {
    if (!subscriptionId)
      return
    await unsubscribe({
      store: runtime.store,
      meta: meta.value,
      collection: previousCollection ?? runtime.getCollection(),
      subscriptionId,
      key: previousKey,
      findOptions: previousFindOptions,
    })
    subscriptionId = undefined
    previousKey = undefined
    previousFindOptions = undefined
    previousCollection = undefined
  }

  /**
   * (Re)subscribe with new options (must run inside the queue).
   * @param optionsValue key or find options for the new subscription
   * @param force resubscribe even when options are unchanged (e.g. the collection changed)
   */
  async function subNow(optionsValue: string | number | FindOptions<any, any, any> | undefined, force: boolean) {
    const key = typeof optionsValue === 'string' || typeof optionsValue === 'number' ? optionsValue : undefined
    const findOptions = typeof optionsValue === 'object' && optionsValue !== null ? optionsValue : undefined
    // The options getter may produce a new object identity on unrelated
    // reactive updates - skip when already subscribed with equivalent options.
    if (!force && subscriptionId && key === previousKey && deepEqual(findOptions, previousFindOptions)) {
      return
    }
    await unsubNow()
    subscriptionId = crypto.randomUUID()
    previousKey = key
    previousFindOptions = findOptions
    previousCollection = runtime.getCollection()
    await subscribe({
      store: runtime.store,
      meta: meta.value,
      collection: previousCollection,
      subscriptionId,
      key: previousKey,
      findOptions: previousFindOptions,
    })
  }

  /** Serialized unsubscribe, safe to call from anywhere. */
  const unsub = () => enqueue(unsubNow)
  /** Serialized (re)subscribe, safe to call from anywhere. */
  const sub = (optionsValue: string | number | FindOptions<any, any, any> | undefined, force = false) =>
    enqueue(() => subNow(optionsValue, force))

  watch(() => toValue(keyOrFindOptions), value => void sub(value), { immediate: true, deep: true })
  tryOnScopeDispose(unsub)
  if (runtime.onInvalidate) {
    // Force: the collection may have changed even though options are equal.
    const { off } = runtime.onInvalidate(() => sub(toValue(keyOrFindOptions), true))
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
