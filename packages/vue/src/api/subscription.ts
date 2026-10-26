import type { CustomHookMeta, FindFirstOptions, FindOptions, QueryRefreshOptions, SetSubscriptionResult } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { SubscriptionIdentity } from '../query/options'
import type { CollectionApiRuntime } from './query'
import { subscribe, unsubscribe } from '@rstore/core'
import { tryOnScopeDispose } from '@vueuse/core'
import { computed, effectScope, onScopeDispose, readonly, ref, toValue, watch } from 'vue'
import { releaseWithStore } from '../events'
import { equalSubscriptionIdentity, resolveSubscriptionIdentity } from '../query/options'
import { createSubscriptionRecovery } from './subscriptionRecovery'

/** Callbacks supplied when a subscription belongs to a live query. */
export interface SubscribeToApiQueryOptions {
  /** Query cardinality, including first queries without an item key. */
  many?: boolean
  /** Reuse the followed page's cached resolved read. */
  identity?: () => SubscriptionIdentity | undefined
  /** Derive followed page index from the resolved subscription options. */
  pageIndex?: (findOptions: FindOptions<any, any, any>) => number | undefined
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
  const live = ref(false)
  if (runtime.store.$isServer) {
    return {
      unsubscribe: () => Promise.resolve(),
      meta: ref<CustomHookMeta>({}),
      live: readonly(live),
    }
  }

  const meta = options.meta ?? ref<CustomHookMeta>({})
  const identity = computed(readIdentity)
  let disposed = false
  let revision = 0
  let watchedIdentity: SubscriptionIdentity | undefined
  let subscriptionId: string | undefined
  // Failed teardown retains transport identity while callbacks stay inactive.
  let closingSubscriptionId: string | undefined
  // Teardown must use the resolved topic that was opened, even after equivalent changes.
  let subscriptionKey: string | number | undefined
  let subscriptionFindOptions: FindOptions<any, any, any> | undefined
  let previousCollection: any

  // All subscribe/unsubscribe work is chained on this promise so rapid
  // option changes cannot interleave their async steps and orphan a
  // server-side subscription.
  let queue: Promise<void> = Promise.resolve()
  const recovery = createSubscriptionRecovery({
    isCurrent: expected => !disposed && revision === expected && options.isActive?.() !== false,
    reopen: subNow,
    close: unsubNow,
    refresh: () => options.refresh!(),
    enqueue,
  })

  /** Chain a task after all pending subscription work, errors included. */
  function enqueue(task: () => Promise<void>, cleanup = false): Promise<void> {
    if (options.enqueue)
      return options.enqueue(task, cleanup)
    queue = queue.then(task, task)
    // Watchers and scope disposal have no awaiting caller. Observe failures
    // without changing the rejection returned by explicit unsubscribe().
    void queue.catch(() => {})
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
        key: subscriptionKey,
        findOptions: subscriptionFindOptions,
      })
    }
    catch (error) {
      options.onTeardownFailure?.(unsubNow)
      throw error
    }
    closingSubscriptionId = undefined
    subscriptionKey = undefined
    subscriptionFindOptions = undefined
    previousCollection = undefined
  }

  /**
   * (Re)subscribe with new options (must run inside the queue).
   * @param expectedRevision options generation captured before queueing
   */
  async function subNow(expectedRevision: number) {
    if (disposed || expectedRevision !== revision)
      return
    await unsubNow()
    if (disposed || expectedRevision !== revision)
      return
    // Re-read the cached descriptor after teardown: options/meta may have
    // changed while waiting, without resolving an unchanged page again.
    const opening = identity.value
    if (disposed || expectedRevision !== revision || !opening || opening.findOptions.enabled === false)
      return
    watchedIdentity = opening
    const { collection: currentCollection, findOptions: resolved } = opening
    const currentId = subscriptionId = crypto.randomUUID()
    const currentRevision = expectedRevision
    /** Callbacks only act while this exact subscription still owns its page. */
    const isActive = () => !disposed && subscriptionId === currentId && revision === currentRevision
      && runtime.getCollection() === currentCollection && options.isActive?.() !== false
    previousCollection = currentCollection
    subscriptionKey = resolved.key
    subscriptionFindOptions = resolved
    try {
      await subscribe({
        store: runtime.store,
        meta: meta.value,
        collection: previousCollection,
        subscriptionId,
        key: subscriptionKey,
        findOptions: subscriptionFindOptions,
        many: options.many,
        pageIndex: options.pageIndex?.(resolved),
        end: options.refresh && ((endOptions) => {
          if (!isActive())
            return
          const endedRevision = ++revision
          live.value = false
          // A synchronous live-state observer may dispose or change ownership.
          if (disposed || revision !== endedRevision)
            return
          // Invalidate immediately; teardown and recovery still use the same
          // queue as option changes and every other followed page.
          recovery.end(endedRevision, endOptions.retry)
        }),
        refresh: options.refresh && (async (refreshOptions) => {
          if (!isActive())
            return
          const result = await options.refresh!(refreshOptions)
          if (isActive())
            recovery.reset()
          return result
        }),
        setResult: options.setResult && ((result, resultOptions) => {
          if (!isActive())
            return 'inactive'
          const outcome = options.setResult!(result, resultOptions)
          // Publication can synchronously change options or end this lease.
          if (outcome === 'applied' && isActive())
            recovery.reset()
          return outcome
        }),
      })
      if (isActive())
        live.value = true
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
    recovery.reset()
    live.value = false
    return enqueue(unsubNow, true)
  }
  /** Serialized (re)subscribe, safe to call from anywhere. */
  const sub = () => {
    const expectedRevision = revision
    return enqueue(() => subNow(expectedRevision))
  }

  // Option and collection followers live in a detached scope so an explicit
  // `unsubscribe()` stops them as well: otherwise a later option change would
  // reopen a remote subscription, and without a caller scope the watcher would
  // retain this subscription for as long as its reactive sources live.
  const followers = effectScope(true)
  /** Forgets the store disposal callback once this subscription ended. */
  let releaseStore: (() => void) | undefined

  /** End this subscription for good: stop following options, close the transport. */
  function dispose() {
    disposed = true
    followers.stop()
    releaseStore?.()
    return unsub()
  }

  /** Resolve current input synchronously so equivalent changes never fence callbacks. */
  function readIdentity(): SubscriptionIdentity | undefined {
    if (options.identity)
      return options.identity()
    const value = toValue(keyOrFindOptions)
    const findOptions: FindFirstOptions<any, any, any> = typeof value === 'string' || typeof value === 'number' ? { key: value } : value ?? {}
    if (findOptions.enabled === false)
      return undefined
    return resolveSubscriptionIdentity(runtime.store, runtime.getCollection(), findOptions, options.many ?? (findOptions.key == null), meta.value)
  }

  followers.run(() => {
    let initialized = false
    // Live pages fence callbacks synchronously themselves. Batch transport
    // watching so unmount can stop it before component options become invalid.
    watch(identity, (next) => {
      // Computed reads include reactive metadata consumed by resolution hooks.
      if (disposed || (initialized && equalSubscriptionIdentity(next, watchedIdentity)))
        return
      initialized = true
      watchedIdentity = next
      // Invalidate old callbacks before serialized unsubscribe reaches the transport.
      revision++
      recovery.reset()
      live.value = false
      void sub()
    }, { immediate: true, deep: true, flush: options.identity ? 'pre' : 'sync' })
    if (runtime.onInvalidate) {
      // Force: the collection may have changed even though options are equal.
      const { off } = runtime.onInvalidate(() => {
        revision++
        recovery.reset()
        live.value = false
        return sub()
      })
      onScopeDispose(off)
    }
  })
  // Without a caller scope, long-lived reactive options would retain the
  // followers, and through them the store: its disposal ends them too.
  // Registered after setup: an already disposed store ends them at once.
  releaseStore = releaseWithStore(runtime.store, () => {
    if (!disposed)
      void dispose()
  })
  tryOnScopeDispose(() => {
    void dispose()
  })
  return { unsubscribe: dispose, meta, live: readonly(live) }
}
