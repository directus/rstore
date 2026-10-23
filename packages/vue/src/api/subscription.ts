import type { CustomHookMeta, FindOptions, QueryRefreshOptions, SetSubscriptionResult } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { CollectionApiRuntime } from './query'
import { subscribe, unsubscribe } from '@rstore/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { klona } from 'klona'
import { ref, toValue, watch } from 'vue'
import { equalFindOptions } from '../query/options'

/** Callbacks supplied when a subscription belongs to a live query. */
export interface SubscribeToApiQueryOptions {
  /** Page index carried by a paginated live subscription. */
  pageIndex?: MaybeRefOrGetter<number | undefined>
  /** Query metadata shared with every followed page. */
  meta?: Ref<CustomHookMeta>
  /** Serialize transitions across all pages of one query. */
  enqueue?: (task: () => Promise<void>, cleanup?: boolean) => Promise<void>
  /** Retain failed teardown for retry before another page transport operation. */
  onTeardownFailure?: (retry: () => Promise<void>) => void
  /** Recheck selection and options before accepting a late delivery. */
  isActive?: () => boolean
  /** Publishes parsed rows for the followed page of the owning live query. */
  setResult?: SetSubscriptionResult
  /** Refetches the followed page of the live query the subscription belongs to. */
  refresh?: (options?: QueryRefreshOptions<FindOptions<any, any, any>>) => Promise<unknown>
}

/**
 * Subscribe and keep subscription options in sync with reactive input.
 */
export function subscribeToApiQuery(
  runtime: CollectionApiRuntime,
  keyOrFindOptions?: MaybeRefOrGetter<string | number | FindOptions<any, any, any> | undefined>,
  options: SubscribeToApiQueryOptions = {},
) {
  if (runtime.store.$isServer) {
    return {
      unsubscribe: () => Promise.resolve(),
      meta: ref<CustomHookMeta>({}),
    }
  }

  const meta = options.meta ?? ref<CustomHookMeta>({})
  let disposed = false
  let revision = 0
  let subscriptionId: string | undefined
  // Failed teardown retains transport identity while callbacks stay inactive.
  let closingSubscriptionId: string | undefined
  let previousKey: string | number | undefined
  let previousFindOptions: FindOptions<any, any, any> | undefined
  let previousCollection: any

  // All subscribe/unsubscribe work is chained on this promise so rapid
  // option changes cannot interleave their async steps and orphan a
  // server-side subscription.
  let queue: Promise<void> = Promise.resolve()

  /** Chain a task after all pending subscription work, errors included. */
  function enqueue(task: () => Promise<void>, cleanup = false): Promise<void> {
    if (options.enqueue)
      return options.enqueue(task, cleanup)
    queue = queue.then(task, task)
    return queue
  }

  /** Unsubscribe the current subscription (must run inside the queue). */
  async function unsubNow() {
    const closingId = subscriptionId ?? closingSubscriptionId
    if (!closingId)
      return
    closingSubscriptionId = closingId
    subscriptionId = undefined
    try {
      await unsubscribe({
        store: runtime.store,
        meta: meta.value,
        collection: previousCollection ?? runtime.getCollection(),
        subscriptionId: closingId,
        key: previousKey,
        findOptions: previousFindOptions,
      })
    }
    catch (error) {
      options.onTeardownFailure?.(unsubNow)
      throw error
    }
    closingSubscriptionId = undefined
    previousKey = undefined
    previousFindOptions = undefined
    previousCollection = undefined
  }

  /**
   * (Re)subscribe with new options (must run inside the queue).
   * @param optionsValue key or find options for the new subscription
   * @param force resubscribe even when options are unchanged (e.g. the collection changed)
   * @param expectedRevision options generation captured before queueing
   */
  async function subNow(optionsValue: string | number | FindOptions<any, any, any> | undefined, force: boolean, expectedRevision: number) {
    if (disposed || expectedRevision !== revision)
      return
    const key = typeof optionsValue === 'string' || typeof optionsValue === 'number' ? optionsValue : undefined
    const findOptions = typeof optionsValue === 'object' && optionsValue !== null ? optionsValue : undefined
    // The options getter may produce a new object identity on unrelated
    // reactive updates - skip when already subscribed with equivalent options.
    if (!force && subscriptionId && key === previousKey && equalFindOptions(findOptions, previousFindOptions)) {
      return
    }
    await unsubNow()
    // A disabled query has nothing to keep live (and may not even name a
    // collection yet): stay unsubscribed until it is enabled.
    if (disposed || expectedRevision !== revision || findOptions?.enabled === false) {
      return
    }
    const currentId = subscriptionId = crypto.randomUUID()
    const currentRevision = expectedRevision
    const currentCollection = runtime.getCollection()
    /** Callbacks only act while this exact subscription still owns its page. */
    const isActive = () => !disposed && subscriptionId === currentId && revision === currentRevision
      && runtime.getCollection() === currentCollection && options.isActive?.() !== false
    previousKey = key
    previousFindOptions = findOptions
    previousCollection = currentCollection
    try {
      await subscribe({
        store: runtime.store,
        meta: meta.value,
        collection: previousCollection,
        subscriptionId,
        key: previousKey,
        findOptions: previousFindOptions,
        pageIndex: toValue(options.pageIndex),
        refresh: options.refresh && (refreshOptions => isActive() ? options.refresh!(refreshOptions) : Promise.resolve()),
        setResult: options.setResult && ((result, resultOptions) => {
          if (!isActive())
            return 'inactive'
          return options.setResult!(result, resultOptions)
        }),
      })
    }
    catch (error) {
      // A provider can acquire its remote lease before registration rejects.
      // Retain that lease for cleanup, but never treat rejection as active.
      closingSubscriptionId = currentId
      subscriptionId = undefined
      throw error
    }
  }

  /** Serialized unsubscribe, safe to call from anywhere. */
  const unsub = () => {
    revision++
    return enqueue(unsubNow, true)
  }
  /** Serialized (re)subscribe, safe to call from anywhere. */
  const sub = (optionsValue: string | number | FindOptions<any, any, any> | undefined, force = false) => {
    const expectedRevision = revision
    return enqueue(() => subNow(optionsValue, force, expectedRevision))
  }

  let watchedOptions: unknown
  let initialized = false
  watch(() => toValue(keyOrFindOptions), (value) => {
    if (initialized && equalFindOptions(value, watchedOptions))
      return
    initialized = true
    watchedOptions = klona(value)
    // Invalidate old callbacks before serialized unsubscribe reaches the transport.
    revision++
    void sub(klona(value))
  }, { immediate: true, deep: true, flush: 'sync' })
  tryOnScopeDispose(() => {
    disposed = true
    void unsub()
  })
  if (runtime.onInvalidate) {
    // Force: the collection may have changed even though options are equal.
    const { off } = runtime.onInvalidate(() => {
      revision++
      return sub(klona(toValue(keyOrFindOptions)), true)
    })
    tryOnScopeDispose(() => off())
  }
  return { unsubscribe: unsub, meta }
}
