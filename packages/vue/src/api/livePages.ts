import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { ComputedRef, EffectScope, Ref } from 'vue'
import type { SubscriptionIdentity } from '../query/options'
import type { CollectionApiRuntime } from './query'
import type { LiveQueryOptions } from './types'
import { tryOnScopeDispose } from '@vueuse/core'
import { computed, effectScope, reactive, shallowReactive, shallowRef, toValue, watch, watchEffect } from 'vue'
import { equalSubscriptionIdentity, resolveSubscriptionIdentity } from '../query/options'
import { getPageIdentityOptions } from '../query/page'
import { subscribeToApiQuery } from './subscription'
import { createSubscriptionQueue } from './subscriptionQueue'

/** One selected page and its detached subscription options. */
interface FollowedPage {
  /** Page identity, also guarding against replacement at the same index. */
  page: any
  /** Position in the query's pages array. */
  index: number
  /** Base read captured before any page overrides. */
  base: SubscriptionIdentity
  /** Cached read shared by reconciliation, opening and callback ownership. */
  current: ComputedRef<SubscriptionIdentity>
  /** Read captured by this selection, used to fence obsolete callbacks. */
  identity: SubscriptionIdentity
}

/** Active subscription scope and the descriptor its callbacks belong to. */
interface PageSubscription {
  /** Independent scope so reconciliation can release this page alone. */
  scope: EffectScope
  /** Last selected window. */
  followed: FollowedPage
  /** State of the page transport, false during termination or backoff. */
  live: Readonly<Ref<boolean>>
}

/** Keep exactly the selected query pages live through one serialized queue. */
export function subscribeToLivePages(
  runtime: CollectionApiRuntime,
  query: any,
  getOptions: () => FindOptions<any, any, any>,
  many: boolean,
  live: Ref<boolean>,
  options: LiveQueryOptions = {},
): void {
  if (runtime.store.$isServer)
    return
  // Result publication replaces query metadata. Keep one reactive object for
  // connector payloads, including hooks that finish after the initial fetch.
  // Copy first: the initial value can be the cache's own entry for these
  // options, which later publications for other options must not mutate.
  const meta = reactive({ ...query.meta.value } as CustomHookMeta)
  watch(() => query.meta.value, (value) => {
    if (value !== meta) {
      Object.assign(meta, value)
      query.meta.value = meta
    }
  }, { immediate: true, flush: 'sync' })
  const subscriptions = shallowReactive(new Map<number, PageSubscription>())
  const createQueueOwner = createSubscriptionQueue()
  let disposed = false

  // A base-read change removes secondary pages even when their overrides hide
  // that change. Share this resolution with the ordinary main page.
  const base = computed(() => resolveSubscriptionIdentity(runtime.store, runtime.getCollection(), getOptions(), many, meta))
  // Weak keys release removed pages; each retained page resolves only when
  // its options or metadata read by resolution hooks change.
  const reads = new WeakMap<object, ComputedRef<SubscriptionIdentity>>()
  const selectedIndexes = computed(() => {
    if (getOptions().enabled === false)
      return []
    const policy = options.pages ?? 'main'
    return [...new Set<number>(policy === 'main'
      ? [query.mainPage.index]
      : policy === 'all'
        ? query.pages.value.flatMap((page: any, index: number) => page ? [index] : [])
        : toValue(policy))]
  })

  /** Resolve each selected page through its retained computed read. */
  function selectedPages(): FollowedPage[] {
    return selectedIndexes.value.flatMap((index) => {
      const page = query.pages.value[index]
      if (!page)
        return []
      let current = reads.get(page)
      if (!current) {
        current = computed(() => Object.keys(page.options).length === 0
          ? base.value
          : resolveSubscriptionIdentity(runtime.store, runtime.getCollection(), getPageIdentityOptions({ getOptions }, page), many, meta))
        reads.set(page, current)
      }
      return [{ page, index, current, identity: current.value, base: base.value }]
    })
  }

  /** Check only this page; never resolve other selected pages on delivery. */
  function isActive(followed: FollowedPage): boolean {
    return !disposed && selectedIndexes.value.includes(followed.index)
      && query.pages.value[followed.index] === followed.page
      && equalSubscriptionIdentity(followed.current.value, followed.identity)
      && equalSubscriptionIdentity(base.value, followed.base)
  }

  // Batch loadMainPage's temporary empty/restored array writes: refreshing a
  // retained page must not close and reopen its subscription.
  watch(selectedPages, (pages) => {
    for (const [index, subscription] of subscriptions) {
      const next = pages.find(page => page.index === index)
      if (!next || next.page !== subscription.followed.page) {
        subscription.scope.stop()
        subscriptions.delete(index)
      }
      else {
        // The single-subscription watcher consumes the same cached read.
        subscription.followed = next
      }
    }
    for (const followed of pages) {
      if (subscriptions.has(followed.index))
        continue
      // Watcher callbacks run outside the original scope. Own each single
      // subscription explicitly and stop it on selection changes or disposal.
      const scope = effectScope(true)
      const subscription: PageSubscription = { scope, followed, live: shallowRef(false) }
      const queueOwner = createQueueOwner(followed.index)
      subscription.live = scope.run(() => subscribeToApiQuery(runtime, undefined, {
        identity: () => followed.current.value,
        many,
        meta: query.meta,
        enqueue: queueOwner.enqueue,
        onTeardownFailure: queueOwner.retainTeardown,
        pageIndex: (resolved) => {
          return many && (resolved.pageSize != null || resolved.pageIndex != null || !followed.page.main) ? followed.index : undefined
        },
        isActive: () => isActive(subscription.followed),
        refresh: refreshOptions => query._refreshPage(followed.page, refreshOptions),
        setResult: (result, resultOptions) => query._setPageResult(followed.page, result, resultOptions),
      }))!.live
      subscriptions.set(followed.index, subscription)
    }
  }, { immediate: true })

  watchEffect(() => {
    // Reconciliation batches temporary page-array writes during refresh. Track
    // its retained subscriptions here, while ended state still publishes at once.
    live.value = !disposed && subscriptions.size > 0 && [...subscriptions.values()].every(subscription => subscription.live.value)
  }, { flush: 'sync' })

  tryOnScopeDispose(() => {
    disposed = true
    live.value = false
    for (const subscription of subscriptions.values())
      subscription.scope.stop()
    subscriptions.clear()
  })
}
